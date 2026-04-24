from .base import BaseNode, Chunk, PipelineContext, register
from ..core.tracer import Tracer


def fixed_chunk(text: str, size: int, overlap: int) -> list[str]:
    if size <= 0:
        raise ValueError("chunk_size must be > 0")
    if overlap >= size:
        raise ValueError("chunk_overlap must be < chunk_size")
    out = []
    i = 0
    while i < len(text):
        out.append(text[i : i + size])
        i += size - overlap
    return out


def recursive_chunk(text: str, size: int, overlap: int) -> list[str]:
    # Split by paragraphs first, then pack into size-bounded windows.
    separators = ["\n\n", "\n", ". ", " "]
    pieces = [text]
    for sep in separators:
        next_pieces: list[str] = []
        for p in pieces:
            if len(p) <= size:
                next_pieces.append(p)
            else:
                next_pieces.extend(p.split(sep))
        pieces = next_pieces

    chunks: list[str] = []
    buf = ""
    for p in pieces:
        if not p.strip():
            continue
        if len(buf) + len(p) + 1 <= size:
            buf = (buf + " " + p).strip() if buf else p
        else:
            if buf:
                chunks.append(buf)
            if len(p) > size:
                chunks.extend(fixed_chunk(p, size, overlap))
                buf = ""
            else:
                buf = p
    if buf:
        chunks.append(buf)

    if overlap > 0 and len(chunks) > 1:
        merged = [chunks[0]]
        for c in chunks[1:]:
            tail = merged[-1][-overlap:]
            merged.append(tail + c)
        chunks = merged
    return chunks


@register("chunker")
class ChunkerNode(BaseNode):
    """Splits documents into chunks.

    params:
      strategy: "fixed" | "recursive"  (default "recursive")
      chunk_size: int (default 500)
      chunk_overlap: int (default 50)
    """

    def run(self, ctx: PipelineContext, tracer: Tracer) -> None:
        strategy = self.params.get("strategy", "recursive")
        size = int(self.params.get("chunk_size", 500))
        overlap = int(self.params.get("chunk_overlap", 50))

        split = recursive_chunk if strategy == "recursive" else fixed_chunk

        for doc in ctx.documents:
            pieces = split(doc.text, size, overlap)
            for i, p in enumerate(pieces):
                ctx.chunks.append(
                    Chunk(id=f"{doc.id}#{i}", text=p, doc_id=doc.id, index=i)
                )
        tracer.log(f"produced {len(ctx.chunks)} chunks (strategy={strategy})")
