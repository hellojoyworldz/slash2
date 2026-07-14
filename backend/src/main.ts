import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // CORS_ORIGIN은 콤마로 구분해 여러 주소를 허용할 수 있다.
  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin:
      corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
