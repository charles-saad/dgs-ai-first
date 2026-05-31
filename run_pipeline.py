"""
Script principal: ingere documentos e executa avaliação do pipeline RAG.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "rag_pipeline"))

from ingest import ingest_documents
from evaluate import run_evaluation

if __name__ == "__main__":
    print("=== PIPELINE RAG — NovaTech Logística ===\n")

    print("ETAPA 1: Ingestão de documentos")
    ingest_documents()

    print("\n\nETAPA 2: Avaliação do pipeline")
    run_evaluation()
