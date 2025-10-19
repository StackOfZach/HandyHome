import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { FirebaseModule } from './modules/firebase.module';
import { AuthService } from './services/auth.service';
import { ActivityTrackerService } from './services/activity-tracker.service';

// Application initializer to ensure auth is ready before app starts
export function initializeAuth(authService: AuthService) {
  return () => authService.waitForAuthInitialization();
}

// Initialize activity tracking
export function initializeActivityTracker(
  activityTracker: ActivityTrackerService
) {
  return () => {
    // ActivityTrackerService initializes itself in constructor
    return Promise.resolve();
  };
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    FirebaseModule,
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeActivityTracker,
      deps: [ActivityTrackerService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
