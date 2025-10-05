import { NgModule } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { environment } from '../../environments/environment';

@NgModule({
  providers: [
    // Initialize Firebase App
    provideFirebaseApp(() => initializeApp(environment.firebase)),

    // Initialize Firebase Auth
    provideAuth(() => getAuth()),

    // Initialize Firestore
    provideFirestore(() => getFirestore()),

    // Initialize Firebase Cloud Messaging for push notifications
    provideMessaging(() => getMessaging()),
  ],
})
export class FirebaseModule {}
