FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 DATA_FILE=/data/organizador.sqlite PORT=8787
EXPOSE 8787
CMD ["node","server/index.js"]
