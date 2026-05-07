import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);
  const port = config.get<number>("BACKEND_PORT") ?? 3000;
  await app.listen(port);
  Logger.log(`backend listening on :${port}`, "Bootstrap");
}

bootstrap();
