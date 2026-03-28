
SYSTEM_ID: wireup_rayray
SYSTEM_TYPE: touchdesigner_tutor_runtime

PURPOSE
Provide explanations of TouchDesigner operators, signal flow, and patch behavior.

PRIMARY_FUNCTIONS
- Answer operator questions.
- Explain signal flow.
- Identify common patch problems.
- Inspect live TouchDesigner patch state when available.

OPERATING_MODES

LOCAL_RUNTIME_MODE
Answers generated from structured knowledge files stored in the repository.
No external AI service required.

SERVER_ASSISTED_MODE
Node/Express server processes requests.
Optional external LLM may augment explanations.
Server can interpret live TouchDesigner patch data.

INPUTS

TEXT_QUERY
User question submitted through the WireUp interface.

PATCH_STATE
Optional data from TouchDesigner containing:
- selected operator
- parameter values
- upstream connections
- downstream connections

KNOWLEDGE_DATASET

LOCATION
data/wireup_runtime/

DATA_CONTENT
- operator records
- glossary concepts
- troubleshooting rules
- normalized operator lookup tables

DATA_PURPOSE
Provide deterministic knowledge retrieval for tutoring responses.

RUNTIME_BEHAVIOR

LOAD_DATASET
Load runtime JSON knowledge files.

RETRIEVE_CONTEXT
Match query tokens to operator names and concept entries.

GENERATE_EXPLANATION
Produce explanation using:
- operator description
- signal behavior
- failure modes
- troubleshooting rules.

USER_INTERFACE

PRIMARY_UI
WireUp Outpost web interface.

UI_BEHAVIOR
- loads runtime knowledge in browser
- answers locally when possible
- optionally calls server endpoint

EXPLANATION_STYLE
Selectable response format:
- simplified explanation
- standard TouchDesigner terminology.

TOUCHDESIGNER_INTEGRATION

COMPONENT
TouchDesigner .tox file.

FUNCTION
Collect selected node information and send it to the tutor system.

PATCH_ANALYSIS
Server may analyze operator relationships and parameters to describe patch behavior.

MACHINE_EXPORT

SYSTEM_ARTIFACTS
Export machine-readable bundles.

ROUTE
/machines/

FORMAT
IPLD-style content addressed documents.

DESIGN_CONSTRAINTS

- Prefer structured knowledge over prompt construction.
- Minimize external API usage.
- Maintain deterministic explanations when possible.
- Support both local and server-assisted operation.



