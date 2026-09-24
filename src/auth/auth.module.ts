import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('app.jwt.secret'),
        signOptions: {
          // `jsonwebtoken` types `expiresIn` as a closed union of literal
          // duration strings, which an environment variable cannot satisfy at
          // compile time. The value is validated as a duration in
          // config/configuration.ts, so the assertion is checked — just not by
          // the type system.
          expiresIn: config.getOrThrow<string>(
            'app.jwt.expiresIn',
          ) as JwtSignOptions['expiresIn'],
          // Pinned explicitly so a token cannot be presented with `alg: none`
          // or a downgraded algorithm.
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
