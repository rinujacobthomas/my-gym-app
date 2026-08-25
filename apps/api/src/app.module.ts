import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaService } from './prisma.service.js'
import { SessionGuard, RolesGuard } from './common/guards.js'
import { SettingsService, AuditService } from './common/services.js'
import { AuthController, MeController } from './auth/auth.controller.js'
import { AuthService } from './auth/auth.service.js'
import { StateController } from './state/state.controller.js'
import { WorkoutsController } from './workouts/workouts.controller.js'
import { MembershipController, PaymentsController } from './membership/membership.controller.js'
import { RazorpayService } from './membership/razorpay.service.js'
import { SchedulingController } from './scheduling/scheduling.controller.js'
import { SlotsService } from './scheduling/slots.service.js'
import { TrainersController } from './trainers/trainers.controller.js'
import { ProgramsController } from './programs/programs.controller.js'
import { ExercisesController } from './exercises/exercises.controller.js'
import { NutritionController } from './nutrition/nutrition.controller.js'
import { OffService } from './nutrition/off.service.js'
import { AdminController } from './admin/admin.controller.js'
import { AnalyticsController } from './admin/analytics.controller.js'
import { PushController } from './push/push.controller.js'
import { PushService } from './push/push.service.js'
import { CronService } from './cron/cron.service.js'
import { HealthController } from './health.controller.js'

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    AuthController, MeController, StateController, WorkoutsController,
    MembershipController, PaymentsController, SchedulingController,
    TrainersController, ProgramsController, ExercisesController,
    NutritionController, AdminController, AnalyticsController,
    PushController, HealthController,
  ],
  providers: [
    PrismaService, SettingsService, AuditService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    AuthService, RazorpayService, SlotsService, OffService, PushService, CronService,
  ],
})
export class AppModule {}
