FROM python:3.12-slim
WORKDIR /app
COPY gateway_py/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY richcrab/proto/proto /app/richcrab/proto/proto
COPY gateway_py /app/gateway_py
WORKDIR /app/gateway_py
RUN ./scripts/gen_proto.sh
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
