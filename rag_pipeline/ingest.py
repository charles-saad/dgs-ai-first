"""
Ingestão de documentos NovaTech no ChromaDB.

Estratégia de chunking: seção semântica (por cabeçalhos Markdown).
Justificativa: documentos normativos têm seções coesas — cortar no meio de uma
tabela de SLA ou de uma regra de devolução perde o contexto necessário para
responder corretamente. Quebrar por cabeçalho preserva a unidade de informação
e evita que um chunk contenha metade de uma tabela. Tamanho médio resultante:
100–300 tokens, bem dentro dos modelos de embedding (512 tokens).
"""

import os
import re
from pathlib import Path
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

DOCS_DIR = Path(__file__).parent.parent / "anexo-a-documentos-individuais"
CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"

# Metadados de confiabilidade por documento
DOC_METADATA = {
    "POL-001": {"type": "normativo", "version": "2.1", "date": "2024-01", "reliability": "high"},
    "SLA-2024": {"type": "normativo", "version": "2024", "date": "2024-01", "reliability": "high"},
    "PROC-042-v2": {"type": "normativo", "version": "v2", "date": "2023-11", "reliability": "high"},
    "PROC-042-v1": {"type": "normativo", "version": "v1", "date": "2023-08", "reliability": "medium"},
    "FAQ-Atendimento": {"type": "informal", "version": "N/A", "date": "N/A", "reliability": "low"},
}


def chunk_by_section(text: str, doc_name: str) -> list[dict]:
    """
    Divide o texto em chunks por seção Markdown (##, ###).
    Cada chunk preserva o título da seção pai para manter contexto.
    """
    lines = text.split("\n")
    chunks = []
    current_h2 = ""
    current_chunk_lines = []
    current_section_title = ""

    for line in lines:
        if line.startswith("## "):
            # Salva chunk anterior se existir
            if current_chunk_lines:
                chunk_text = "\n".join(current_chunk_lines).strip()
                if len(chunk_text) > 50:  # ignora chunks trivialmente pequenos
                    chunks.append({
                        "text": chunk_text,
                        "section": current_section_title,
                        "h2": current_h2,
                    })
            current_h2 = line.strip("# ").strip()
            current_section_title = current_h2
            current_chunk_lines = [line]

        elif line.startswith("### "):
            # Salva chunk anterior se existir
            if current_chunk_lines:
                chunk_text = "\n".join(current_chunk_lines).strip()
                if len(chunk_text) > 50:
                    chunks.append({
                        "text": chunk_text,
                        "section": current_section_title,
                        "h2": current_h2,
                    })
            sub_title = line.strip("# ").strip()
            current_section_title = f"{current_h2} > {sub_title}"
            current_chunk_lines = [f"[Contexto: {current_h2}]\n{line}"]

        else:
            current_chunk_lines.append(line)

    # Último chunk
    if current_chunk_lines:
        chunk_text = "\n".join(current_chunk_lines).strip()
        if len(chunk_text) > 50:
            chunks.append({
                "text": chunk_text,
                "section": current_section_title,
                "h2": current_h2,
            })

    return chunks


def ingest_documents():
    print("Iniciando ingestão de documentos...")

    model = SentenceTransformer("all-MiniLM-L6-v2")
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    # Remove coleção existente para re-ingestão limpa
    try:
        client.delete_collection("novatech_docs")
    except Exception:
        pass

    collection = client.create_collection(
        name="novatech_docs",
        metadata={"hnsw:space": "cosine"},
    )

    all_chunks = []
    doc_files = list(DOCS_DIR.glob("*.md"))

    for doc_path in sorted(doc_files):
        doc_name = doc_path.stem
        text = doc_path.read_text(encoding="utf-8")
        meta = DOC_METADATA.get(doc_name, {"type": "desconhecido", "version": "N/A", "date": "N/A", "reliability": "unknown"})

        chunks = chunk_by_section(text, doc_name)
        print(f"  {doc_name}: {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            all_chunks.append({
                "id": f"{doc_name}_chunk_{i}",
                "text": chunk["text"],
                "metadata": {
                    "doc_name": doc_name,
                    "section": chunk["section"],
                    "h2": chunk["h2"],
                    "doc_type": meta["type"],
                    "doc_version": meta["version"],
                    "doc_date": meta["date"],
                    "reliability": meta["reliability"],
                },
            })

    # Gera embeddings em lote
    texts = [c["text"] for c in all_chunks]
    print(f"\nGerando embeddings para {len(all_chunks)} chunks...")
    embeddings = model.encode(texts, show_progress_bar=True).tolist()

    # Insere no ChromaDB
    collection.add(
        ids=[c["id"] for c in all_chunks],
        documents=texts,
        embeddings=embeddings,
        metadatas=[c["metadata"] for c in all_chunks],
    )

    print(f"\nIngestão concluída: {len(all_chunks)} chunks armazenados em {CHROMA_DIR}")
    return collection


if __name__ == "__main__":
    ingest_documents()
