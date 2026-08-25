import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] })
  // Razorpay webhooks post raw bodies; signature verification needs the exact bytes.
  app.use(json({ limit: '2mb', verify: (req: any, _res, buf) => { req.rawBody = buf } }))
  app.use(urlencoded({ extended: true }))
  app.setGlobalPrefix('api')
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
    credentials: true,
  })
  await app.listen(process.env.PORT || 3000)
  console.log(`openGym API on :${process.env.PORT || 3000}`)
}

bootstrap()
