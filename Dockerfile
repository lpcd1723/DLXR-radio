FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
ENV PORT=8080
ENV AZURACAST_HOST=192.168.0.53
ENV STATION_SHORTCODE=iadt_radio
CMD ["node", "server.js"]
