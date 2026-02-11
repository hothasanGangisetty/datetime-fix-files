"""
Safe JSON Serialization Layer  (Flask 3.x + Pandas 3.x compatible)

Problem  : Flask 3.x ignores app.json_encoder.  Pandas 3.x df.fillna("")
           raises TypeError on datetime64 columns.  pd.isna() on NaT-like
           objects calls .timetuple() which crashes.
Solution : Convert every cell BEFORE json.dumps, then use our own
           safe_jsonify() with default=str as ultimate fallback.

Handles all SQL Server temporal types:
  TIME, DATETIME, DATETIME2, SMALLDATETIME,
  DATETIMEOFFSET, TIMESTAMP WITH TIME ZONE / LOCAL TIME ZONE
"""

from flask import Response
import pandas as pd
import numpy as np
import json

# CRITICAL: import datetime as MODULE so we can use datetime.datetime,
# datetime.date, datetime.time, datetime.timedelta without ambiguity.
# DO NOT use "from datetime import datetime" — it shadows the module!
import datetime
import decimal
from datetime import timezone

# ---------- Pandas version compatibility ----------
PANDAS_HAS_IS_DATETIMETZ = hasattr(pd.api.types, 'is_datetimetz')


def _is_datetimetz(series):
    """Backward-compatible check for timezone-aware datetime columns."""
    if PANDAS_HAS_IS_DATETIMETZ:
        return pd.api.types.is_datetimetz(series)
    # Fallback for older pandas versions
    return (pd.api.types.is_datetime64_any_dtype(series)
            and series.dt.tz is not None)


# ==================== Timestamp Normalisation ==============================

def normalize_timestamp(val):
    """Normalize ALL SQL datetime data types to a consistent string format.

    Handles:
      pd.Timestamp, datetime.datetime, datetime.date, datetime.time,
      datetime.timedelta, timezone-aware variants, and string representations.

    Returns '' for null-ish values.
    """
    if pd.isna(val) or val is None:
        return ''

    # ---- Handle pandas Timestamp objects ----
    if isinstance(val, pd.Timestamp):
        if val.tzinfo is not None:
            val_utc = val.tz_convert('UTC')
            if val_utc.microsecond > 0:
                return val_utc.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3] + 'Z'
            else:
                return val_utc.strftime('%Y-%m-%d %H:%M:%S') + 'Z'
        else:
            if val.microsecond > 0:
                return val.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            else:
                return val.strftime('%Y-%m-%d %H:%M:%S')

    # ---- Handle datetime.datetime objects (DATETIME2, DATETIMEOFFSET) ----
    if isinstance(val, datetime.datetime):
        if val.tzinfo is not None:
            val_utc = val.astimezone(timezone.utc)
            if val_utc.microsecond > 0:
                return val_utc.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3] + 'Z'
            else:
                return val_utc.strftime('%Y-%m-%d %H:%M:%S') + 'Z'
        else:
            if val.microsecond > 0:
                return val.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            else:
                return val.strftime('%Y-%m-%d %H:%M:%S')

    # ---- Handle datetime.date objects ----
    if isinstance(val, datetime.date):
        return val.strftime('%Y-%m-%d')

    # ---- Handle datetime.time objects (TIME with/without ms) ----
    if isinstance(val, datetime.time):
        # Create a full datetime object so strftime works properly
        dt = datetime.datetime.combine(datetime.date.min, val)
        if val.tzinfo is not None:
            dt_utc = dt.astimezone(timezone.utc)
            if dt_utc.microsecond > 0:
                return dt_utc.strftime('%H:%M:%S.%f')[:-3] + 'Z'
            else:
                return dt_utc.strftime('%H:%M:%S') + 'Z'
        else:
            if dt.microsecond > 0:
                return dt.strftime('%H:%M:%S.%f')[:-3]
            else:
                return dt.strftime('%H:%M:%S')

    # ---- Handle datetime.timedelta objects ----
    if isinstance(val, datetime.timedelta):
        total_seconds = val.total_seconds()
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        int_seconds = int(seconds)
        microseconds = round((seconds - int_seconds) * 1000000)
        if microseconds > 0:
            ms = microseconds // 1000
            return f"{int(hours):02}:{int(minutes):02}:{int_seconds:02d}.{ms:03d}"
        else:
            return f"{int(hours):02}:{int(minutes):02}:{int_seconds:02d}"

    # ---- Handle string representations ----
    if isinstance(val, str):
        s_val = val.strip()
        if s_val in ('', 'None', 'nan', 'NaT', 'NaN', '<NA>'):
            return ''
        return s_val

    # Fallback
    return str(val).strip()


# ==================== Safe Value Conversion ================================

def _safe_val(v):
    """Convert ONE value to a JSON-native primitive.

    Returns str/int/float/bool or '' for nulls.
    NaT is checked BEFORE pd.isna() to avoid timetuple crash.
    """
    # ---- None / NaN / NaT  (order matters!) ----
    if v is None:
        return ''
    if v is pd.NaT:
        return ''
    if isinstance(v, float):
        if np.isnan(v) or np.isinf(v):
            return ''
        return v
    if isinstance(v, (np.floating,)):
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return ''
        return f
    try:
        if pd.isna(v):
            return ''
    except (TypeError, ValueError):
        pass

    # ---- Temporal types  (must be before generic str check) ----
    # Use normalize_timestamp for consistent formatting across all datetime types
    if isinstance(v, pd.Timestamp):
        return normalize_timestamp(v)
    if isinstance(v, datetime.datetime):       # before date (subclass)
        return normalize_timestamp(v)
    if isinstance(v, datetime.date):
        return normalize_timestamp(v)
    if isinstance(v, datetime.time):
        return normalize_timestamp(v)
    if isinstance(v, datetime.timedelta):
        return normalize_timestamp(v)
    if isinstance(v, pd.Timedelta):
        return str(v)

    # ---- Numeric / numpy ----
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, decimal.Decimal):
        f = float(v)
        return int(f) if f == int(f) else f

    # ---- Binary ----
    if isinstance(v, (bytes, bytearray, memoryview)):
        return str(v)

    # ---- String-ish null sentinels ----
    if isinstance(v, str) and v.strip().lower() in ('none', 'nat', 'nan', '<na>'):
        return ''

    return v


# ==================== DataFrame Sanitization ================================

def sanitize_df_for_json(df):
    """Make every cell in a DataFrame safe for json.dumps.

    Replaces `df.fillna("")` + handles typed columns that fillna crashes on.
    Processes ALL columns regardless of dtype.
    """
    df = df.copy()

    # Handle datetime columns first for better performance
    for col in df.select_dtypes(include=['datetime64']).columns:
        # Check for timezone-aware columns (using our backward-compatible function)
        if _is_datetimetz(df[col]):
            df[col] = df[col].apply(
                lambda x: normalize_timestamp(x) if pd.notna(x) else '')
        else:
            df[col] = df[col].apply(
                lambda x: normalize_timestamp(x) if pd.notna(x) else '')

    # Process all remaining columns
    for col in df.columns:
        df[col] = df[col].map(_safe_val)
    return df


def safe_jsonify(data, status=200):
    """Flask-version-agnostic JSON response.

    Uses json.dumps with default=str as ultimate fallback so it
    NEVER raises a serialisation error.
    Pre-converts datetime objects before serialization.
    """
    def _pre_convert(obj):
        """Recursively convert datetime objects in dicts/lists."""
        if isinstance(obj, dict):
            return {k: _pre_convert(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_pre_convert(i) for i in obj]
        if isinstance(obj, (pd.Timestamp, datetime.datetime, datetime.date,
                            datetime.time, datetime.timedelta)):
            return normalize_timestamp(obj)
        return obj

    data = _pre_convert(data)
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return Response(payload, status=status, mimetype='application/json')
