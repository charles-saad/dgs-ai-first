"""
Avalia o pipeline RAG contra o gabarito do Anexo B.
Executa 5 perguntas de teste e documenta os resultados.
"""

from search import search
from prompt_builder import build_prompt

# Gabarito do Anexo B — chunks esperados por pergunta
GABARITO = {
    "Q1": {
        "pergunta": "Qual o prazo de devolução para carga perigosa?",
        "chunks_esperados": ["POL-001_chunk_3"],  # seção 3.2 Exceções por tipo de carga
        "doc_esperado": "POL-001",
        "resposta_esperada": "carga perigosa não é elegível para devolução pelo processo padrão",
    },
    "Q2": {
        "pergunta": "Meu cliente é Gold, qual o SLA de resolução?",
        "chunks_esperados": ["SLA-2024_chunk_2"],  # tabela de SLAs chamados gerais
        "doc_esperado": "SLA-2024",
        "resposta_esperada": "24 horas úteis para chamados gerais",
    },
    "Q3": {
        "pergunta": "Quanto custa o frete para 600kg para Manaus?",
        "chunks_esperados": ["PROC-042-v2_chunk_2"],  # fórmula e multiplicadores v2
        "doc_esperado": "PROC-042-v2",
        "resposta_esperada": "multiplicador Norte 1,8, fator de peso 1,0",
    },
    "Q4": {
        "pergunta": "Qual o prazo de devolução padrão?",
        "chunks_esperados": ["POL-001_chunk_2"],  # seção 3.1 Prazo padrão
        "doc_esperado": "POL-001",
        "resposta_esperada": "7 dias úteis",
    },
    "Q5": {
        "pergunta": "O que é um incidente crítico?",
        "chunks_esperados": ["SLA-2024_chunk_3"],  # seção 3. SLA para Incidentes Críticos
        "doc_esperado": "SLA-2024",
        "resposta_esperada": "carga acima de R$ 100.000 sem localização",
    },
}


def run_evaluation():
    print("=" * 70)
    print("AVALIAÇÃO DO PIPELINE RAG — NovaTech Logística")
    print("=" * 70)

    results = []

    for q_id, case in GABARITO.items():
        pergunta = case["pergunta"]
        print(f"\n{'─'*60}")
        print(f"[{q_id}] {pergunta}")
        print(f"{'─'*60}")

        chunks = search(pergunta, n_results=3)

        print("\nChunks recuperados:")
        chunks_corretos = 0
        for i, chunk in enumerate(chunks, 1):
            meta = chunk["metadata"]
            chunk_id = chunk["id"]
            is_correct = chunk_id in case["chunks_esperados"]
            correct_doc = meta["doc_name"] == case["doc_esperado"]
            marker = "✅" if is_correct else ("🟡" if correct_doc else "❌")

            print(f"  {marker} [{i}] {chunk_id}")
            print(f"      Similaridade: {chunk['similarity']:.4f} | Doc: {meta['doc_name']} v{meta['doc_version']}")
            print(f"      Seção: {meta['section'][:60]}")

            if is_correct:
                chunks_corretos += 1

        # Verifica se ao menos o documento correto apareceu no top-1
        top1_doc = chunks[0]["metadata"]["doc_name"] if chunks else ""
        top1_correct = top1_doc == case["doc_esperado"]

        print(f"\nGabarito: chunks esperados = {case['chunks_esperados']}")
        print(f"Resultado: chunk exato recuperado = {'✅' if chunks_corretos > 0 else '❌'} | doc correto no top-1 = {'✅' if top1_correct else '❌'}")

        # Monta e exibe o prompt
        prompt = build_prompt(pergunta, chunks[:3])
        print(f"\nPrompt montado: {len(prompt)} caracteres")
        print(f"(Use o prompt acima para testar no Claude via chat)")

        results.append({
            "id": q_id,
            "pergunta": pergunta,
            "chunk_exato_recuperado": chunks_corretos > 0,
            "doc_correto_top1": top1_correct,
            "top1_similarity": chunks[0]["similarity"] if chunks else 0,
            "chunks": chunks,
            "prompt": prompt,
        })

    # Sumário
    print(f"\n{'='*70}")
    print("SUMÁRIO DA AVALIAÇÃO")
    print(f"{'='*70}")
    acertos_exatos = sum(1 for r in results if r["chunk_exato_recuperado"])
    acertos_doc = sum(1 for r in results if r["doc_correto_top1"])
    print(f"Chunk exato no top-3:    {acertos_exatos}/{len(results)}")
    print(f"Documento correto top-1: {acertos_doc}/{len(results)}")

    return results


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
    run_evaluation()
