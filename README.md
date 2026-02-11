# DateTime Fix Files

**Fix for:** `comparison failed: type object date.time has no attribute 'time'`

These 3 files contain the complete fix for handling all SQL Server temporal types in the Reconcile Suite comparison engine.

## Root Cause

```python
from datetime import datetime  # <-- This imports the CLASS, not the module
isinstance(val, datetime.time)  # <-- Fails! datetime is now the CLASS, not the module
```

## Fix Applied

| File | Import Fix | Key Changes |
|------|-----------|-------------|
| `json_utils.py` | `import datetime` (module) | Added `normalize_timestamp()`, `_is_datetimetz()` |
| `comparison_engine.py` | `import datetime as dt_module`, `import time as time_module` | Fixed all `time.time()` → `time_module.time()`, enhanced normalization |
| `routes.py` | `import datetime as dt_module` | Added `handle_sql_datetime_types()`, applied to all endpoints |

## SQL Types Handled

- `TIME` (with/without milliseconds)
- `DATETIME` / `DATETIME2` / `SMALLDATETIME`
- `DATETIMEOFFSET`
- `TIMESTAMP WITH TIME ZONE`
- `TIMESTAMP WITH LOCAL TIME ZONE`
- `timedelta` objects

## File Placement

Copy these files to your project:

```
server/
  common/
    json_utils.py       ← Replace existing
  module_1/
    comparison_engine.py ← Replace existing
    routes.py            ← Replace existing (This is module_1 routes, NOT app.py)
```

> **Note:** `routes.py` here is the Module 1 blueprint routes file, not the main `app.py`.
