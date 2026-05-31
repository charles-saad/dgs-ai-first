"""
Busca semântica no ChromaDB com filtragem por confiabilidade de fonte.
"""

from pathlib import Path
import chromadb
from sentence_transformers import SentenceTransformer

CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"

_model = None
_collection = None


def _get_resources():
    global _model, _collection
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    if _collection is None:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        _collection = client.get_collection("novatech_docs")
    return _model, _collection


def search(query: str, n_results: int = 4) -> list[dict]:
    """
    Busca os N chunks mais relevantes para a query.
    Retorna lista de dicts com texto, metadados e score de similaridade.
    """
    model, collection = _get_resources()

    query_embedding = model.encode([query]).tolist()[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    for i in range(len(results["ids"][0])):
        # ChromaDB com cosine retorna distância (0=idêntico, 2=oposto)
        # Convertemos para score de similaridade (1=idêntico)
        distance = results["distances"][0][i]
        similarity = 1 - (distance / 2)

        chunks.append({
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "similarity": round(similarity, 4),
        })

    return chunks


def search_with_details(query: str, n_results: int = 4) -> None:
    """Busca e imprime resultados formatados para inspeção."""
    print(f"\n{'='*60}")
    print(f"QUERY: {query}")
    print(f"{'='*60}")

    chunks = search(query, n_results)

    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        print(f"\n[Chunk {i}] Similaridade: {chunk['similarity']:.4f}")
        print(f"  Documento: {meta['doc_name']} (v{meta['doc_version']}, {meta['doc_date']})")
        print(f"  Seção: {meta['section']}")
        print(f"  Confiabilidade: {meta['reliability']}")
        print(f"  Texto (primeiros 300 chars):")
        print(f"  {chunk['text'][:300]}...")

    return chunks
