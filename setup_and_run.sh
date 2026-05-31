#!/bin/bash
# Setup e execução do pipeline RAG NovaTech

python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows PowerShell

pip install -r requirements.txt
python run_pipeline.py
