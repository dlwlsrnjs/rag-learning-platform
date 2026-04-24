# Retrieval-Augmented Generation (RAG)

Retrieval-Augmented Generation, or RAG, is a technique that combines a large
language model (LLM) with an external knowledge source. Instead of relying
solely on what the model learned during training, a RAG system retrieves
relevant documents at query time and gives them to the model as context.

## Why RAG?

LLMs have three well-known weaknesses: they hallucinate facts, their
knowledge has a training cutoff, and they cannot access private data. RAG
addresses all three by grounding answers in documents the operator controls.
If the document changes, the next answer reflects the change — no retraining
required.

## The Five Stages

A minimal RAG pipeline has five stages:

1. **Load** the source documents into text.
2. **Chunk** the text into passages small enough to embed.
3. **Embed** each chunk into a vector that captures its meaning.
4. **Retrieve** the chunks most similar to the user's query.
5. **Generate** an answer that uses the retrieved chunks as context.

## Chunking Tradeoffs

Chunk size controls a fundamental tradeoff: small chunks are precise but
may lack context; large chunks carry context but dilute relevance scores.
A typical starting point is 300–800 characters with 10–20% overlap, then
adjust based on evaluation results.

## Embedding Models

Different embedding models capture meaning at different granularities.
`text-embedding-3-small` is cheap and fast and works well for English
technical text. Multilingual or domain-specific corpora often benefit from
specialized models. The only way to know which works for your data is to
evaluate on a small held-out set of queries.
