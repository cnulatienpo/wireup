# Ray Ray RAG Audit

This repo now includes a standalone audit runner: `rayray_rag_audit.py`.

## Run the audit

```bash
DEBUG_RAG=true python rayray_rag_audit.py "how do i stitch clips together"
```

- `DEBUG_RAG=true` enables file logging.
- Without `DEBUG_RAG=true`, the script still prints a terminal report but does not write debug files.
- The audit runner now uses `sentence-transformers` with `all-MiniLM-L6-v2` for semantic embeddings.
- First run may take longer because the embedding model is downloaded and the corpus is embedded once at startup.

## What gets traced

The audit runner logs these pipeline stages:

1. **Query logging**
   - `timestamp`
   - `user_query`
   - `query_type_guess` (`operator_definition`, `workflow_recipe`, `troubleshooting`, `unknown`)

2. **Embedding trace**
   - `embedding_model_used`
   - `embedding_vector_length`
   - `embedding_generation_time_ms`
   - document chunks are embedded once at startup and reused for each query in-process

3. **Retrieval trace**
   - Top 10 retrieved chunks with:
     - `document_id`
     - `document_type` (`glossary | recipe | error`)
     - `operator_name`
     - `similarity_score`
     - `text_preview_first_120_chars`

4. **Chunk filtering trace**
   - `selected_context` with full chunk metadata/text and `decision_reason` (`reason_selected` kept for compatibility)
   - `dropped_context` with full chunk metadata/text and `decision_reason` (`reason_dropped` kept for compatibility)

5. **Prompt assembly trace**
   - full prompt saved to `logs/rag_prompt.txt`
   - includes system prompt, selected context, and user query
   - this is the exact `full_prompt` passed to generation

6. **Response trace**
   - `model_used`
   - `response_tokens`
   - `generation_time_ms`
   - full response saved to `logs/rag_response.txt`

7. **Pipeline routing trace**
   - routing is decided **before generation** using user query + query type + selected context
   - one of:
     - `glossary_responder`
     - `recipe_responder`
     - `error_responder`
     - `fallback_responder`

8. **Retrieval visualization JSON**
   - `logs/retrieval_debug.json`
   - contains query, `query_type_guess`, `retrieved_docs`, `selected_docs`, `dropped_docs`, and `response_mode`

## Log files

When `DEBUG_RAG=true`, the script writes:

- `logs/rag_prompt.txt`
- `logs/rag_response.txt`
- `logs/retrieval_debug.json`
- `logs/rag_audit_report.json`

## Interpreting output

- **Wrong query type guess** can force wrong routing (for example glossary route for a workflow question).
- **High-scoring but irrelevant retrieval** indicates weak retrieval signal.
- **Selected context mismatching query type** suggests filtering rules need adjustment.
- **Fallback responder** for specific queries usually means classification/routing ambiguity.
- Query heuristics prioritize workflow phrases before definition intent.

## Common failure signatures

1. **Recipe query routed to glossary_responder**
   - Signature: `query_type_guess=operator_definition` and selected docs are mostly glossary.
   - Fix direction: improve query classification keywords.

2. **Irrelevant top retrieval chunks**
   - Signature: top scores include unrelated operators (for example `multiply_top` for stitching workflow queries).
   - Fix direction: adjust embedding model choice and/or retrieval chunking strategy.

3. **No selected context**
   - Signature: retrieval has results but `selected_context` is empty.
   - Fix direction: relax score thresholds or add fallback selection.

4. **Slow generation time**
   - Signature: high `generation_time_ms` in `response_trace`.
   - Fix direction: lower max tokens or reduce prompt size.
