FROM python:3.7-alpine

RUN apk update && apk add git

COPY . /app

WORKDIR /app

RUN pip install -r requirements.txt

CMD gunicorn -b 0.0.0.0:8000 web:app
