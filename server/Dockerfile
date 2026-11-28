# Calculation server for the Element Combinator site (works as a Hugging Face Docker Space: port 7860).
# Build from the repository root:  docker build -f server/Dockerfile -t element-calc .
FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY js/elements.js js/elements.js
COPY server/ server/
WORKDIR /app/server
# download the MACE-MP-0 model at build time so the first request is fast
RUN python -c "from mace.calculators import mace_mp; mace_mp(model='small', device='cpu')"
ENV OMP_NUM_THREADS=1 CALC_CACHE=/app/server/cache
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
