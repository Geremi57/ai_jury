FROM golang:1.26

WORKDIR /app

COPY . .

RUN go build -o server jury ./cmd/server/

CMD ["./jury"]