# FIERY_CAPABILITY_MATRIX.md
Print2Go Production OS — V0.3 Capability Matrix (read-only discovery)

All rows are `UNKNOWN` in the current environment because PX300 is not reachable.
Values are produced by the Edge Agent's TCP probing only; they will be replaced by
evidence-backed results when the agent runs on hardware that can reach PX300.

| ACTION | AVAILABLE | MECHANISM | SUPPORTED | REQUIRES_CONFIGURATION | REQUIRES_LICENSE | LOCAL_OR_SERVER | EVIDENCE | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| CONNECT | UNKNOWN | Fiery API / Hot Folder / CWS (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only; device unreachable | LOW |
| IMPORT_TO_HELD | UNKNOWN | Fiery API / Hot Folder (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |
| FIND_JOB | UNKNOWN | Fiery API / CWS (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |
| READ_JOB_STATE | UNKNOWN | Fiery API / CWS (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |
| OPEN_IMPOSE | UNKNOWN | Fiery Impose (CWS module) | UNKNOWN | UNKNOWN | UNKNOWN (likely license) | LOCAL/SERVER | TCP probe only | LOW |
| APPLY_TEMPLATE | UNKNOWN | Impose template / preset (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |
| SAVE_IMPOSED_JOB | UNKNOWN | Fiery API / CWS (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |
| VERIFY_JOB_STATE | UNKNOWN | Fiery API / CWS (TBD) | UNKNOWN | UNKNOWN | UNKNOWN | SERVER | TCP probe only | LOW |

## Summary flags
```
REAL_FIERY_API_AVAILABLE               = UNKNOWN
HOT_FOLDER_AVAILABLE                   = UNKNOWN
JDF_JMF_AVAILABLE                      = UNKNOWN
LONDON_BC_DETECTED                     = UNKNOWN
LONDON_BC_PROGRAMMATICALLY_APPLICABLE  = UNKNOWN
GUI_AUTOMATION_REQUIRED                = UNKNOWN
DEVICE_REACHABLE                       = NO (in this environment)
REAL_FIERY_BACKEND                     = NOT_IMPLEMENTED
```
