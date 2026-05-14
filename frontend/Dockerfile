FROM python:3.12-alpine

WORKDIR /app

COPY . .

EXPOSE 5500

CMD ["python", "-m", "http.server", "5500", "--bind", "0.0.0.0"]
