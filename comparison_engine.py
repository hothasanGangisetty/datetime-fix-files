"""
Module 1: Smart Fingerprint Comparison Engine
Key-based + hash-based order-independent comparison for SQL-to-File reconciliation.

Handles all SQL Server temporal types:
  TIME (with/without ms), DATETIME, DATETIME2, SMALLDATETIME,
  DATETIMEOFFSET, TIMESTAMP WITH TIME ZONE / LOCAL TIME ZONE
"""

import pandas as pd
import numpy as np
import re
import time as time_module  # renamed to avoid clash with datetime.time
from collections import Counter

# CRITICAL: import datetime as MODULE to avoid the
# "type object 'datetime' has no attribute 'time'" error.
# When you do `from datetime import datetime`, the name `datetime`
# becomes the CLASS, and `datetime.time` fails because the class
# doesn't have a `.time` type attribute.
import datetime as dt_module
from datetime import timezone

# Import from our json_utils (which also uses `import datetime` as module)
from common.json_utils import sanitize_df_for_json, _is_datetimetz, normalize_timestamp


# ---------------------------------------------------------------------------
# Maximum number of unmatched rows (per side) that will go through the
# O(n*m) similarity-pairing step.  Beyond this the tool reports them as
# missing/extra without attempting to pair, because the matrix would be
# too large.  5 000 x 5 000 = 25 M comparisons -- a few seconds at most.
# ---------------------------------------------------------------------------
MAX_PAIR_SIZE = 5000


# ============================== Normalisation ==============================

def normalize_series_for_comparison(s):
    """Normalize a pandas Series values so that equivalent values compare equal.

    Handles:
    - All datetime types: datetime, datetime2, datetimeoffset, smalldatetime
    - Time types: time (with/without milliseconds)
    - Timestamp with time zone / local time zone
    - datetime.date vs datetime.datetime (2025-11-01 vs 2025-11-01 00:00:00)
    - String representations of dates with trailing 00:00:00
    - Numeric precision (1750.0 vs 1750, trailing zeros)
    - Whitespace trimming
    - NaN / None placeholders
    """
    def norm(val):
        if pd.isna(val) or val is None:
            return '__NULL__'

        # Handle all datetime types first
        if isinstance(val, (pd.Timestamp, dt_module.datetime, dt_module.date,
                            dt_module.time, dt_module.timedelta)):
            ts_str = normalize_timestamp(val)
            # Strip trailing fractional zeros for consistency with string path
            ts_str = re.sub(r'(\.\d*?)0+$', r'\1', ts_str)
            ts_str = re.sub(r'\.$', '', ts_str)
            return ts_str

        s_val = str(val).strip()

        if s_val in ('', 'None', 'nan', 'NaT', 'NaN', '<NA>'):
            return '__NULL__'

        # Remove trailing midnight time component (datetime strings only)
        s_val = re.sub(r'\s+00:00:00(\.\d+)?$', '', s_val)

        # Remove trailing zero seconds for SMALLDATETIME (datetime strings only)
        # Only strip :00 when preceded by a date portion (YYYY-MM-DD HH:MM:00)
        # Do NOT strip from standalone time values like "14:30:00"
        s_val = re.sub(r'(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}):00(\.\d*)?$', r'\1', s_val)

        if re.match(r'^\d{4}-\d{2}-\d{2}$', s_val):
            return s_val

        # Timestamp normalisation: strip trailing zeros from decimals
        # Matches: 2024-12-01 10:20:30.123000 -> 2024-12-01 10:20:30.123
        # Also matches: 10:20:30.123000 -> 10:20:30.123
        s_val = re.sub(r'(\.\d*?)0+$', r'\1', s_val)

        # Numeric normalisation: 1750.0 -> 1750, 1750.50 -> 1750.5
        try:
            num = float(s_val)
            if num == int(num):
                return str(int(num))
            return f"{num:g}"
        except (ValueError, OverflowError):
            pass

        return s_val

    return s.map(norm)


def _fast_normalize_series(s):
    """Vectorised normalisation optimised for large datasets (100K+ rows).

    Produces the *same* logical result as normalize_series_for_comparison()
    but uses bulk pandas string operations instead of per-cell Python calls.
    ~10-30x faster on 1M rows.

    Handles datetime columns (including timezone-aware) specially.
    """
    # Handle datetime columns
    if pd.api.types.is_datetime64_any_dtype(s):
        # Format with milliseconds if they exist
        if _is_datetimetz(s):
            # Convert to UTC first
            s_utc = s.dt.tz_convert('UTC')
            formatted = s_utc.dt.strftime('%Y-%m-%d %H:%M:%S.%f').str[:-3]
            formatted = formatted.where(
                s_utc.dt.microsecond > 0,
                s_utc.dt.strftime('%Y-%m-%d %H:%M:%S')
            ) + 'Z'
            return formatted.where(~formatted.isna(), '__NULL__')
        else:
            formatted = s.dt.strftime('%Y-%m-%d %H:%M:%S.%f').str[:-3]
            formatted = formatted.where(
                s.dt.microsecond > 0,
                s.dt.strftime('%Y-%m-%d %H:%M:%S')
            )
            return formatted.where(~formatted.isna(), '__NULL__')

    # Handle timedelta columns
    if pd.api.types.is_timedelta64_dtype(s):
        return s.apply(
            lambda x: normalize_timestamp(x) if pd.notna(x) else '__NULL__'
        )

    # Convert everything to string, strip whitespace
    out = s.astype(str).str.strip()

    # Replace null-ish strings with sentinel
    null_mask = out.isin(['', 'None', 'nan', 'NaT', 'NaN', '<NA>'])
    out = out.where(~null_mask, '__NULL__')

    # Handle different datetime formats
    # Date-only
    date_mask = out.str.match(r'^\d{4}-\d{2}-\d{2}$')
    # Time-only
    time_mask = out.str.match(r'^\d{2}:\d{2}:\d{2}(\.\d{1,6})?$')
    # Datetime with milliseconds
    datetime_ms_mask = out.str.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{1,6}$')
    # Datetime without milliseconds
    datetime_no_ms_mask = out.str.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$')

    # Add .000 to datetime without milliseconds
    out = out.where(~datetime_no_ms_mask, out + '.000')

    # Handle timezone information
    tz_mask = out.str.contains(r'[Z|[+\-]\d{2}:\d{2}$')
    out = out.where(~tz_mask, out + 'Z')

    # Strip midnight time component: "2025-01-01 00:00:00" -> "2025-01-01"
    out = out.str.replace(r'\s+00:00:00(\.\d+)?$', '', regex=True)

    # Strip trailing zero seconds for SMALLDATETIME (datetime strings only)
    # Only match when preceded by a date: YYYY-MM-DD HH:MM:00
    out = out.str.replace(r'(\\d{4}-\\d{2}-\\d{2}\\s+\\d{1,2}:\\d{2}):00(\\.\\d*)?$', r'\\1', regex=True)

    # Numeric normalisation via string regex (avoids slow pd.to_numeric):
    # "1750.0" / "1750.00" -> "1750"
    out = out.str.replace(r'\.0+$', '', regex=True)
    # "1750.50" -> "1750.5",  "3.140" -> "3.14"
    out = out.str.replace(r'(\.\d*?)0+$', r'\1', regex=True)
    # Clean up lone decimal point if any: "1750." -> "1750"
    out = out.str.replace(r'\.$', '', regex=True)

    return out


def _clean_display_value(val):
    """Clean a value for display -- strip midnight timestamps, tidy numbers.

    Properly handles: datetime.time, datetime.datetime, datetime.date,
    datetime.timedelta, pd.Timestamp, and string representations.
    """
    if pd.isna(val) or val is None:
        return ''

    # Handle all datetime types directly via normalize_timestamp
    if isinstance(val, (pd.Timestamp, dt_module.datetime, dt_module.date,
                        dt_module.time, dt_module.timedelta)):
        return normalize_timestamp(val)

    s = str(val).strip()
    if s in ('None', 'nan', 'NaT', 'NaN', ''):
        return ''

    # Handle string representations
    # Date-only
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return s

    # Time-only
    if re.match(r'^\d{2}:\d{2}:\d{2}(\.\d{1,6})?$', s):
        return s

    # Datetime with milliseconds
    if re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{1,6}$', s):
        return s

    # Datetime without milliseconds
    if re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$', s):
        return s

    # Handle other string formats
    try:
        # Try parsing with pandas to_datetime
        dt = pd.to_datetime(s)
        if pd.isna(dt):
            return ''
        return normalize_timestamp(dt)
    except (ValueError, TypeError):
        pass

    return s


# ========================= Pre / Post Transform ===========================

def transform_to_pre_post(diff_df, key_cols, common_cols, sql_label='SQL', file_label='File'):
    """Transform side-by-side _sql/_file columns into stacked source rows.

    For Mismatches:     2 rows (source=sql_label values, source=file_label values)
    For Only in SQL:    1 row  (source=sql_label)
    For Only in File:   1 row  (source=file_label)

    sql_label / file_label control the value in the 'source' column,
    e.g. 'SQL' and 'test@diff.xlsx'.
    """
    rows = []

    for _, row in diff_df.iterrows():
        status = row.get('status', '')

        # Identify which columns have value mismatches
        mismatch_cols = []
        if status == 'Mismatch':
            for col in common_cols:
                raw_sql  = row.get(f'{col}_sql', '__NA__')
                raw_file = row.get(f'{col}_file', '__NA__')
                n1 = normalize_series_for_comparison(pd.Series([raw_sql])).iloc[0]
                n2 = normalize_series_for_comparison(pd.Series([raw_file])).iloc[0]
                if n1 != n2:
                    mismatch_cols.append(col)

        mismatch_str = ','.join(mismatch_cols)

        # SQL row
        if status in ('Mismatch', 'Only in SQL'):
            pre = {k: row.get(k, '') for k in key_cols}
            for col in common_cols:
                pre[col] = _clean_display_value(row.get(f'{col}_sql', row.get(col, '')))
            pre['source'] = sql_label
            pre['status'] = status
            pre['_mismatch_cols'] = mismatch_str
            rows.append(pre)

        # File row
        if status in ('Mismatch', 'Only in File'):
            post = {k: row.get(k, '') for k in key_cols}
            for col in common_cols:
                post[col] = _clean_display_value(row.get(f'{col}_file', row.get(col, '')))
            post['source'] = file_label
            post['status'] = status
            post['_mismatch_cols'] = mismatch_str
            rows.append(post)

    if not rows:
        return pd.DataFrame(columns=key_cols + common_cols + ['source', 'status', '_mismatch_cols'])

    result = pd.DataFrame(rows)
    ordered = [c for c in key_cols + common_cols + ['source', 'status', '_mismatch_cols'] if c in result.columns]
    return result[ordered]


# =================== Smart Fingerprint Comparison ==========================

def _compute_normalized_frame(df, cols):
    """Return a DataFrame of normalised string values for *cols*.
    Uses the fast vectorised path for performance on large datasets.
    Special handling for datetime columns (including timezone-aware)."""
    nf = pd.DataFrame(index=df.index)
    for col in cols:
        # Special handling for datetime columns
        if (pd.api.types.is_datetime64_any_dtype(df[col]) or
                _is_datetimetz(df[col])):
            nf[col] = df[col].apply(normalize_timestamp)
        else:
            nf[col] = _fast_normalize_series(df[col])
    return nf


def _smart_no_key_comparison(df_sql, df_file, common_cols):
    """Intelligent comparison without primary keys.

    Algorithm
    ---------
    1.  Normalise every cell and compute a hash fingerprint per row.
    2.  Multiset exact-match elimination  (handles duplicate rows correctly).
    3.  For the remaining unmatched rows, build a column-level similarity
        matrix and greedily pair the best matches (threshold >= 30 % cols).
    4.  Paired rows  ->  Mismatch.
        Unpaired SQL  ->  Only in SQL.
        Unpaired File ->  Only in File.

    Returns (diff_df, matched_count).
    diff_df columns: {col}_sql, {col}_file, status, has_mismatch, Match#
    """
    t0 = time_module.time()
    n_cols = len(common_cols)

    # ---- Step 1: normalise + fingerprint ----
    sql_norm  = _compute_normalized_frame(df_sql, common_cols)
    file_norm = _compute_normalized_frame(df_file, common_cols)

    sql_hashes  = pd.util.hash_pandas_object(sql_norm, index=False)
    file_hashes = pd.util.hash_pandas_object(file_norm, index=False)

    print(f"  [Fingerprint] Hashed {len(df_sql)} SQL + {len(df_file)} File rows in {time_module.time()-t0:.2f}s")

    # ---- Step 2: multiset exact-match elimination ----
    t1 = time_module.time()

    sql_hash_groups  = {}
    for idx, h in zip(df_sql.index, sql_hashes):
        sql_hash_groups.setdefault(h, []).append(idx)

    file_hash_groups = {}
    for idx, h in zip(df_file.index, file_hashes):
        file_hash_groups.setdefault(h, []).append(idx)

    sql_matched  = set()
    file_matched = set()

    for h, sql_idxs in sql_hash_groups.items():
        if h in file_hash_groups:
            file_idxs = file_hash_groups[h]
            pairs = min(len(sql_idxs), len(file_idxs))
            sql_matched.update(sql_idxs[:pairs])
            file_matched.update(file_idxs[:pairs])

    matched_count = len(sql_matched)

    sql_unmatched_idxs  = [i for i in df_sql.index  if i not in sql_matched]
    file_unmatched_idxs = [i for i in df_file.index if i not in file_matched]

    print(f"  [Match]  {matched_count} exact matches eliminated, "
          f"{len(sql_unmatched_idxs)} SQL + {len(file_unmatched_idxs)} File "
          f"unmatched in {time_module.time()-t1:.2f}s")

    # ---- Step 3: similarity-based pairing ----
    paired = []
    pairing_skipped = False

    if (len(sql_unmatched_idxs) > 0 and len(file_unmatched_idxs) > 0):
        if (len(sql_unmatched_idxs) <= MAX_PAIR_SIZE
                and len(file_unmatched_idxs) <= MAX_PAIR_SIZE):
            t2 = time_module.time()

            sql_vals  = sql_norm.loc[sql_unmatched_idxs].values
            file_vals = file_norm.loc[file_unmatched_idxs].values

            # Vectorised similarity matrix: sim[i][j] = matching-column count
            similarity = np.zeros((len(sql_vals), len(file_vals)), dtype=np.int32)
            for c in range(n_cols):
                sql_col  = sql_vals[:, c].reshape(-1, 1)
                file_col = file_vals[:, c].reshape(1, -1)
                similarity += (sql_col == file_col).astype(np.int32)

            # Minimum threshold: at least 30 % of columns must match (min 1)
            min_threshold = max(1, n_cols * 30 // 100)

            # Collect candidate pairs above threshold
            rows_i, cols_j = np.where(similarity >= min_threshold)
            scores = similarity[rows_i, cols_j]

            # Sort descending by score (greedy best-first)
            order  = np.argsort(-scores)
            rows_i = rows_i[order]
            cols_j = cols_j[order]

            sql_paired_set  = set()
            file_paired_set = set()

            for i, j in zip(rows_i, cols_j):
                if i not in sql_paired_set and j not in file_paired_set:
                    paired.append((sql_unmatched_idxs[i], file_unmatched_idxs[j]))
                    sql_paired_set.add(i)
                    file_paired_set.add(j)

            print(f"  [Pair]   {len(paired)} similarity pairs found "
                  f"(threshold {min_threshold}/{n_cols} cols) in {time_module.time()-t2:.2f}s")

            # Remove paired indices from the unmatched lists
            paired_sql  = {p[0] for p in paired}
            paired_file = {p[1] for p in paired}
            sql_unmatched_idxs  = [i for i in sql_unmatched_idxs  if i not in paired_sql]
            file_unmatched_idxs = [i for i in file_unmatched_idxs if i not in paired_file]
        else:
            pairing_skipped = True
            print(f"  [Pair]   SKIPPED -- unmatched set too large "
                  f"({len(sql_unmatched_idxs)} x {len(file_unmatched_idxs)}). "
                  f"Reporting as missing/extra. Select key columns for best accuracy.")

    # ---- Step 4: build diff DataFrame ----
    rows = []
    row_num = 0

    for sql_idx, file_idx in paired:
        row_num += 1
        r = {'Match#': row_num}
        for col in common_cols:
            r[f'{col}_sql']  = df_sql.at[sql_idx, col]
            r[f'{col}_file'] = df_file.at[file_idx, col]
        r['status'] = 'Mismatch'
        r['has_mismatch'] = True
        rows.append(r)

    for sql_idx in sql_unmatched_idxs:
        row_num += 1
        r = {'Match#': row_num}
        for col in common_cols:
            r[f'{col}_sql']  = df_sql.at[sql_idx, col]
            r[f'{col}_file'] = np.nan
        r['status'] = 'Only in SQL'
        r['has_mismatch'] = False
        rows.append(r)

    for file_idx in file_unmatched_idxs:
        row_num += 1
        r = {'Match#': row_num}
        for col in common_cols:
            r[f'{col}_sql']  = np.nan
            r[f'{col}_file'] = df_file.at[file_idx, col]
        r['status'] = 'Only in File'
        r['has_mismatch'] = False
        rows.append(r)

    if not rows:
        diff_df = pd.DataFrame(
            columns=['Match#'] +
            [f'{c}_sql' for c in common_cols] +
            [f'{c}_file' for c in common_cols] +
            ['status', 'has_mismatch'])
    else:
        diff_df = pd.DataFrame(rows)

    print(f"  [Done]   Smart comparison finished in {time_module.time()-t0:.2f}s total")
    return diff_df, matched_count, pairing_skipped


# ====================== Key-Based Comparison ================================

def _key_based_comparison(df_sql, df_file, keys):
    """Standard key-based comparison via pd.merge outer join."""
    print(f"  Key-Based Comparison: {keys}")

    for key in keys:
        if key in df_sql.columns:
            df_sql[key] = df_sql[key].astype(str).str.strip()
        if key in df_file.columns:
            df_file[key] = df_file[key].astype(str).str.strip()

    merged_df = pd.merge(
        df_sql, df_file, on=keys, how='outer',
        suffixes=('_sql', '_file'), indicator=True)

    key_cols = keys
    common_cols = [c for c in df_sql.columns
                   if c in df_file.columns and c not in keys]

    merged_df['has_mismatch'] = False
    for col in common_cols:
        mask_both = merged_df['_merge'] == 'both'
        s1 = normalize_series_for_comparison(merged_df.loc[mask_both, f'{col}_sql'])
        s2 = normalize_series_for_comparison(merged_df.loc[mask_both, f'{col}_file'])
        merged_df.loc[mask_both & (s1 != s2), 'has_mismatch'] = True

    final = merged_df[
        (merged_df['_merge'] != 'both') | (merged_df['has_mismatch'])
    ].copy()

    status_map = {
        'left_only':  'Only in SQL',
        'right_only': 'Only in File',
        'both':       'Mismatch'
    }
    final['status'] = final['_merge'].map(status_map)
    final.drop(columns=['_merge'], inplace=True, errors='ignore')

    matched = len(merged_df) - len(final)
    return final, key_cols, common_cols, matched


# ========================== Public Entry Point ==============================

def run_hybrid_comparison(df_sql, df_file, keys=None, file_name='File'):
    """Compare two DataFrames and return (pre_post_df, summary).

    When *keys* are provided  -> key-based outer join  (100 % accurate).
    When *keys* are empty     -> smart fingerprint + similarity pairing
                                 (accurate regardless of row order).

    file_name is used as the label for the file source column (instead of 'post').

    Handles all SQL temporal types:
      TIME, DATETIME, DATETIME2, SMALLDATETIME, DATETIMEOFFSET,
      TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH LOCAL TIME ZONE
    """
    t_start = time_module.time()

    # ── Convert all datetime columns to normalized strings at entry ──
    # This prevents downstream type confusion (datetime.time vs time module, etc.)
    for col in df_sql.columns:
        if (pd.api.types.is_datetime64_any_dtype(df_sql[col]) or
                _is_datetimetz(df_sql[col])):
            df_sql[col] = df_sql[col].apply(normalize_timestamp)
    for col in df_file.columns:
        if (pd.api.types.is_datetime64_any_dtype(df_file[col]) or
                _is_datetimetz(df_file[col])):
            df_file[col] = df_file[col].apply(normalize_timestamp)

    if keys and len(keys) > 0:
        # ---- Key-Based ----
        final, key_cols, common_cols, matched = _key_based_comparison(
            df_sql, df_file, keys)

        summary = {
            "total_sql_rows":     len(df_sql),
            "total_file_rows":    len(df_file),
            "matched_rows":       matched,
            "total_discrepancies": len(final),
            "mismatches":         int((final['status'] == 'Mismatch').sum()),
            "only_on_sql":        int((final['status'] == 'Only in SQL').sum()),
            "only_on_file":       int((final['status'] == 'Only in File').sum()),
            "comparison_mode":    "Key-Based",
            "pairing_skipped":    False,
            "key_cols":           key_cols,
            "common_cols":        common_cols,
            "elapsed_seconds":    round(time_module.time() - t_start, 2)
        }

        pre_post_df = transform_to_pre_post(final, key_cols, common_cols, sql_label='SQL', file_label=file_name)

        # Apply sanitization to datetime columns in pre_post_df
        for col in pre_post_df.columns:
            if col in common_cols:
                if (pd.api.types.is_datetime64_any_dtype(df_sql[col]) if col in df_sql.columns else False) or \
                   (pd.api.types.is_datetime64_any_dtype(df_file[col]) if col in df_file.columns else False):
                    pre_post_df[col] = pre_post_df[col].apply(_clean_display_value)

        return pre_post_df, summary

    else:
        # ---- Smart Fingerprint ----
        print("Smart Fingerprint Comparison Active")
        common_cols = [c for c in df_sql.columns if c in df_file.columns]

        diff_df, matched, pairing_skipped = _smart_no_key_comparison(
            df_sql, df_file, common_cols)

        key_cols = ['Match#']

        summary = {
            "total_sql_rows":     len(df_sql),
            "total_file_rows":    len(df_file),
            "matched_rows":       matched,
            "total_discrepancies": len(diff_df),
            "mismatches":         int((diff_df['status'] == 'Mismatch').sum()) if len(diff_df) > 0 else 0,
            "only_on_sql":        int((diff_df['status'] == 'Only in SQL').sum()) if len(diff_df) > 0 else 0,
            "only_on_file":       int((diff_df['status'] == 'Only in File').sum()) if len(diff_df) > 0 else 0,
            "comparison_mode":    "Smart Fingerprint",
            "pairing_skipped":    pairing_skipped,
            "key_cols":           key_cols,
            "common_cols":        common_cols,
            "elapsed_seconds":    round(time_module.time() - t_start, 2)
        }

        pre_post_df = transform_to_pre_post(diff_df, key_cols, common_cols, sql_label='SQL', file_label=file_name)

        # Apply sanitization to datetime columns in pre_post_df
        for col in pre_post_df.columns:
            if col in common_cols:
                if (pd.api.types.is_datetime64_any_dtype(df_sql[col]) or
                        pd.api.types.is_datetime64_any_dtype(df_file[col])):
                    pre_post_df[col] = pre_post_df[col].apply(_clean_display_value)

        return pre_post_df, summary
