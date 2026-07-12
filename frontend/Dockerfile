# 로컬 개발용: 의존성만 이미지에 설치하고, 소스는 docker-compose에서 볼륨으로 마운트한다.
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
EXPOSE 8081
CMD ["npx", "expo", "start", "--web"]
