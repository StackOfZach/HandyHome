import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

export interface BookingData {
  id: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
  };
  estimatedDuration: string;
  schedule: {
    date: string;
    time: string;
  };
  status: string;
  clientName?: string;
  clientPhone?: string;
  createdAt: any;
}

@Component({
  selector: 'app-job-details-modal',
  standalone: false,
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar class="bg-gradient-to-r from-blue-600 to-indigo-600">
        <ion-title class="text-white font-bold">Job Request Details</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()" fill="clear">
            <ion-icon name="close" class="text-white text-xl"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="bg-gray-50">
      <div class="p-4" *ngIf="bookingData">
        <!-- Service Information Card -->
        <div
          class="bg-white rounded-2xl shadow-lg p-5 mb-4 border border-blue-100"
        >
          <div class="flex items-center mb-4">
            <div
              class="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mr-3 shadow-md"
            >
              <ion-icon name="construct" class="text-white text-lg"></ion-icon>
            </div>
            <div>
              <h2 class="text-lg font-bold text-gray-800">
                {{ bookingData.categoryName }}
              </h2>
              <p class="text-blue-600 font-medium">
                {{ bookingData.subService }}
              </p>
            </div>
          </div>

          <div class="bg-blue-50 rounded-xl p-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="flex items-center text-sm text-gray-600 mb-1">
                  <ion-icon name="calendar-outline" class="mr-2"></ion-icon>
                  <span>{{ bookingData.schedule?.date }}</span>
                </div>
                <div class="flex items-center text-sm text-gray-600">
                  <ion-icon name="time-outline" class="mr-2"></ion-icon>
                  <span>{{ bookingData.schedule?.time }}</span>
                </div>
              </div>
              <div>
                <div class="flex items-center text-sm text-gray-600">
                  <ion-icon name="hourglass-outline" class="mr-2"></ion-icon>
                  <span>{{ bookingData.estimatedDuration }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Location Card -->
        <div
          class="bg-white rounded-2xl shadow-lg p-5 mb-4 border border-green-100"
        >
          <div class="flex items-center mb-3">
            <div
              class="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center mr-3"
            >
              <ion-icon name="location" class="text-white"></ion-icon>
            </div>
            <h3 class="text-lg font-semibold text-gray-800">
              Service Location
            </h3>
          </div>

          <div class="bg-green-50 rounded-xl p-4 mb-3">
            <p class="text-gray-700 font-medium">
              {{ bookingData.location?.address }}
            </p>
            <div class="flex items-center mt-2 text-sm text-gray-600">
              <ion-icon name="navigate-outline" class="mr-1"></ion-icon>
              <span>{{ distance }} km away</span>
            </div>
          </div>

          <!-- Mini Map Placeholder -->
          <div
            class="bg-gray-200 rounded-xl h-32 flex items-center justify-center"
          >
            <div class="text-center">
              <ion-icon
                name="map-outline"
                class="text-4xl text-gray-500 mb-2"
              ></ion-icon>
              <p class="text-gray-600 text-sm">Location Map</p>
            </div>
          </div>
        </div>

        <!-- Client Information Card -->
        <div
          class="bg-white rounded-2xl shadow-lg p-5 mb-4 border border-purple-100"
          *ngIf="clientData"
        >
          <div class="flex items-center mb-3">
            <div
              class="w-10 h-10 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center mr-3"
            >
              <ion-icon name="person" class="text-white"></ion-icon>
            </div>
            <h3 class="text-lg font-semibold text-gray-800">
              Client Information
            </h3>
          </div>

          <div class="bg-purple-50 rounded-xl p-4">
            <p class="font-semibold text-gray-800 mb-1">
              {{ clientData.fullName || 'Client' }}
            </p>
            <div
              class="flex items-center text-sm text-gray-600"
              *ngIf="clientData.phone"
            >
              <ion-icon name="call-outline" class="mr-2"></ion-icon>
              <span>{{ clientData.phone }}</span>
            </div>
          </div>
        </div>

        <!-- Price Breakdown Card -->
        <div
          class="bg-white rounded-2xl shadow-lg p-5 mb-6 border border-orange-100"
        >
          <div class="flex items-center mb-4">
            <div
              class="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center mr-3"
            >
              <ion-icon name="cash" class="text-white"></ion-icon>
            </div>
            <h3 class="text-lg font-semibold text-gray-800">Payment Details</h3>
          </div>

          <div class="bg-orange-50 rounded-xl p-4">
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Service Price:</span>
                <span class="font-medium text-gray-800"
                  >₱{{
                    bookingData.pricing?.basePrice | number : '1.2-2'
                  }}</span
                >
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">HandyHome Fee:</span>
                <span class="font-medium text-red-600"
                  >-₱{{
                    bookingData.pricing?.serviceCharge | number : '1.2-2'
                  }}</span
                >
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">Transport Fee:</span>
                <span class="font-medium text-green-600"
                  >+₱{{
                    bookingData.pricing?.transportFee | number : '1.2-2'
                  }}</span
                >
              </div>
              <div class="border-t pt-2 mt-2">
                <div class="flex justify-between font-bold text-lg">
                  <span class="text-gray-800">Your Payout:</span>
                  <span class="text-green-600"
                    >₱{{ getPayoutAmount() | number : '1.2-2' }}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Timer and Urgency -->
        <div
          class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"
          *ngIf="timeRemaining > 0"
        >
          <div class="flex items-center">
            <ion-icon name="timer" class="text-red-600 text-xl mr-3"></ion-icon>
            <div>
              <p class="font-semibold text-red-800">Respond quickly!</p>
              <p class="text-sm text-red-600">
                Auto-decline in {{ timeRemaining }} seconds
              </p>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-3">
          <button
            (click)="acceptJob()"
            [disabled]="isProcessing"
            class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div class="flex items-center justify-center">
              <ion-icon
                name="checkmark-circle"
                class="text-xl mr-2"
                *ngIf="!isProcessing"
              ></ion-icon>
              <ion-spinner
                name="crescent"
                class="mr-2"
                *ngIf="isProcessing"
              ></ion-spinner>
              <span>{{
                isProcessing ? 'Accepting Job...' : 'Accept Job'
              }}</span>
            </div>
          </button>

          <button
            (click)="declineJob()"
            [disabled]="isProcessing"
            class="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div class="flex items-center justify-center">
              <ion-icon name="close-circle" class="text-xl mr-2"></ion-icon>
              <span>Decline</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div
        class="flex items-center justify-center h-64"
        *ngIf="!bookingData && isLoading"
      >
        <div class="text-center">
          <ion-spinner
            name="crescent"
            class="text-4xl text-blue-600 mb-4"
          ></ion-spinner>
          <p class="text-gray-600">Loading job details...</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: #f9fafb;
      }

      .bg-gradient-to-r {
        background: linear-gradient(to right, var(--tw-gradient-stops));
      }

      .from-blue-600 {
        --tw-gradient-from: #2563eb;
      }
      .to-indigo-600 {
        --tw-gradient-to: #4f46e5;
      }
    `,
  ],
})
export class JobDetailsModalComponent implements OnInit {
  @Input() bookingId!: string;
  @Input() notificationId!: string;
  @Output() jobAccepted = new EventEmitter<any>();
  @Output() jobDeclined = new EventEmitter<string>();

  bookingData: BookingData | null = null;
  clientData: any = null;
  isLoading = true;
  isProcessing = false;
  distance = 0;
  timeRemaining = 30;
  private timer: any;

  constructor(
    private modalCtrl: ModalController,
    private firestore: Firestore
  ) {}

  async ngOnInit() {
    await this.loadBookingDetails();
    this.startTimer();
  }

  private async loadBookingDetails() {
    try {
      const bookingRef = doc(this.firestore, `bookings/${this.bookingId}`);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        this.bookingData = {
          id: bookingSnap.id,
          ...bookingSnap.data(),
        } as BookingData;

        // Load client data
        if (this.bookingData.clientId) {
          await this.loadClientData(this.bookingData.clientId);
        }

        // Calculate distance (mock for now)
        this.distance = Math.round(Math.random() * 10 + 1);
      }
    } catch (error) {
      console.error('Error loading booking details:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadClientData(clientId: string) {
    try {
      const clientRef = doc(this.firestore, `users/${clientId}`);
      const clientSnap = await getDoc(clientRef);

      if (clientSnap.exists()) {
        this.clientData = clientSnap.data();
      }
    } catch (error) {
      console.error('Error loading client data:', error);
    }
  }

  private startTimer() {
    this.timer = setInterval(() => {
      this.timeRemaining--;
      if (this.timeRemaining <= 0) {
        this.autoDecline();
      }
    }, 1000);
  }

  private autoDecline() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.declineJob();
  }

  getPayoutAmount(): number {
    if (!this.bookingData?.pricing) return 0;
    return (
      this.bookingData.pricing.basePrice -
      this.bookingData.pricing.serviceCharge +
      this.bookingData.pricing.transportFee
    );
  }

  async acceptJob() {
    this.isProcessing = true;

    try {
      if (this.timer) {
        clearInterval(this.timer);
      }

      await this.modalCtrl.dismiss({
        action: 'accepted',
        bookingId: this.bookingId,
        notificationId: this.notificationId,
        bookingData: this.bookingData,
      });
    } catch (error) {
      console.error('Error accepting job:', error);
      this.isProcessing = false;
    }
  }

  async declineJob() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    await this.modalCtrl.dismiss({
      action: 'declined',
      notificationId: this.notificationId,
    });
  }

  async dismiss() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.modalCtrl.dismiss();
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
