import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from '@angular/fire/firestore';
import { LoadingController, ToastController } from '@ionic/angular';

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  averagePrice: number;
  serviceChargeRate: number;
  estimatedDuration: number; // in minutes
  services: string[];
  servicesQuickBookingPricing?: number[]; // Array of prices for quick booking
  isActive: boolean;
  createdAt: any;
}

@Component({
  selector: 'app-select-category',
  templateUrl: './select-category.page.html',
  styleUrls: ['./select-category.page.scss'],
  standalone: false,
})
export class SelectCategoryPage implements OnInit {
  serviceCategories: ServiceCategory[] = [];
  isLoading = true;
  isQuickBooking = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private firestore: Firestore,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    // Check if this is a quick booking
    this.route.queryParams.subscribe((params) => {
      this.isQuickBooking = params['type'] === 'quick';
    });

    await this.loadServiceCategories();
  }

  async loadServiceCategories() {
    try {
      const loading = await this.loadingController.create({
        message: 'Loading categories...',
        spinner: 'crescent',
      });
      await loading.present();

      const categoriesRef = collection(this.firestore, 'serviceCategories');
      const q = query(
        categoriesRef,
        where('isActive', '==', true),
        orderBy('name', 'asc')
      );

      const querySnapshot = await getDocs(q);
      this.serviceCategories = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<ServiceCategory, 'id'>;
        this.serviceCategories.push({
          id: doc.id,
          ...data,
        });
      });

      await loading.dismiss();
      this.isLoading = false;
    } catch (error) {
      console.error('Error loading service categories:', error);
      this.isLoading = false;
      await this.showToast(
        'Error loading categories. Please try again.',
        'danger'
      );
    }
  }

  async selectCategory(category: ServiceCategory) {
    // Navigate to select-location with category ID and booking type
    if (this.isQuickBooking) {
      this.router.navigate(['/client/select-location', category.id], {
        queryParams: { type: 'quick' },
      });
    } else {
      this.router.navigate(['/client/select-location', category.id]);
    }
  }

  goBack() {
    this.router.navigate(['/pages/client/dashboard']);
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  // Helper method to get minimum price for display
  getMinimumPrice(category: ServiceCategory): number {
    // Get minimum price from servicesQuickBookingPricing array
    if (category.servicesQuickBookingPricing && category.servicesQuickBookingPricing.length > 0) {
      // Find the minimum price from the pricing array
      return Math.min(...category.servicesQuickBookingPricing);
    }
    
    // Fall back to averagePrice if servicesQuickBookingPricing is not available
    return category.averagePrice || 0;
  }

  // Helper method to format price
  formatPrice(price: number): string {
    return `₱${price.toLocaleString()}`;
  }

  // Helper method to get gradient style for category cards
  getCardGradient(color: string): string {
    return `linear-gradient(135deg, ${color}, ${color}cc)`;
  }
}
