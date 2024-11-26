FROM denoland/deno:alpine-1.45.5

WORKDIR /app

COPY main.ts .
COPY deno.lock .

RUN deno cache main.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
