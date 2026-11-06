# Base image pinned by digest so every build of a release uses the same Node runtime.
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
WORKDIR /app
COPY package.json ./
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
# SQLite temporary files go to /tmp (a tmpfs in the stack, whose root filesystem is read-only).
ENV NODE_ENV=production HOST=0.0.0.0 DATA_FILE=/data/organizador.sqlite PORT=8787 SQLITE_TMPDIR=/tmp
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","server/index.js"]
