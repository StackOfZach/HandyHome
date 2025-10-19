import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';

interface Service {
  id: string;
  name: string;
  category: string;
}

@Component({
  selector: 'app-book-service',
  templateUrl: './book-service.page.html',
  styleUrls: ['./book-service.page.scss'],
  standalone: false,
})
export class BookServicePage implements OnInit {
  selectedService = '';
  selectedDateTime = '';
  minBudget: number | null = null;
  maxBudget: number | null = null;
  additionalDetails = '';
  isLoading = false;
  showValidation = false;
  currentUser: any = null;
  services: Service[] = [];
  minDate = new Date().toISOString();
  maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year from now

  constructor(
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    await this.loadServices();
  }

  async loadServices() {
    try {
      const servicesQuery = query(
        collection(this.firestore, 'serviceCategories')
      );
      const querySnapshot = await getDocs(servicesQuery);

      this.services = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.services.push({
          id: doc.id,
          name: data['name'] || data['category'],
          category: data['category'] || 'General',
        });
      });

      // Fallback services if none exist in Firestore
      if (this.services.length === 0) {
        this.services = [
          { id: '1', name: 'Plumbing', category: 'Home Repair' },
          { id: '2', name: 'Electrical Work', category: 'Home Repair' },
          { id: '3', name: 'House Cleaning', category: 'Cleaning' },
          { id: '4', name: 'Gardening', category: 'Outdoor' },
          { id: '5', name: 'Carpentry', category: 'Home Repair' },
          { id: '6', name: 'Appliance Repair', category: 'Home Repair' },
        ];
      }
    } catch (error) {
      console.error('Error loading services:', error);
      // Use fallback services
      this.services = [
        { id: '1', name: 'Plumbing', category: 'Home Repair' },
        { id: '2', name: 'Electrical Work', category: 'Home Repair' },
        { id: '3', name: 'House Cleaning', category: 'Cleaning' },
        { id: '4', name: 'Gardening', category: 'Outdoor' },
        { id: '5', name: 'Carpentry', category: 'Home Repair' },
        { id: '6', name: 'Appliance Repair', category: 'Home Repair' },
      ];
    }
  }

  goBack() {
    this.router.navigate(['/client']);
  }

  async findWorkers() {
    this.showValidation = true;

    if (
      !this.selectedService ||
      !this.selectedDateTime ||
      !this.minBudget ||
      !this.maxBudget
    ) {
      const toast = await this.toastController.create({
        message: 'Please fill in all required fields',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    if (this.minBudget >= this.maxBudget) {
      const toast = await this.toastController.create({
        message: 'Maximum budget must be greater than minimum budget',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    if (!this.currentUser) {
      const toast = await this.toastController.create({
        message: 'Please log in to continue',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
      return;
    }

    this.isLoading = true;

    try {
      // Create booking in Firestore
      const bookingData = {
        clientId: this.currentUser.uid,
        clientName: this.currentUser.displayName || this.currentUser.email,
        neededService: this.selectedService,
        scheduleDate: new Date(this.selectedDateTime),
        priceRange: this.maxBudget,
        minBudget: this.minBudget,
        maxBudget: this.maxBudget,
        additionalDetails: this.additionalDetails,
        status: 'searching',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log('📝 Creating booking with data:', bookingData);

      const docRef = await addDoc(
        collection(this.firestore, 'bookings'),
        bookingData
      );

      console.log('✅ Booking created with ID:', docRef.id);

      // Navigate to worker lookup with booking ID
      this.router.navigate(['/client/worker-lookup'], {
        queryParams: {
          bookingId: docRef.id,
          service: this.selectedService,
          date: this.selectedDateTime,
          minBudget: this.minBudget,
          maxBudget: this.maxBudget,
        },
      });
    } catch (error) {
      console.error('Error creating booking:', error);
      const toast = await this.toastController.create({
        message: 'Error creating booking. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.isLoading = false;
    }
  }
}
