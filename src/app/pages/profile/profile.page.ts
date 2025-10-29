import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonicModule,
  IonModal,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../services/auth.service';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  writeBatch,
  where,
} from '@angular/fire/firestore';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { ClientVerificationService } from '../../services/client-verification.service';
import { MapPickerComponent } from '../../components/map-picker/map-picker.component';

export interface Address {
  id?: string;
  label: string;
  contactPerson: string;
  phoneNumber: string;
  fullAddress: string;
  isDefault: boolean;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
}

export interface BookingPreferences {
  preferredCategories: string[];
  paymentMethod: string;
  pushNotifications: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

export interface AppSettings {
  language: string;
  region: string;
  darkMode: boolean;
}

// Extended UserProfile interface for this component
export interface ExtendedUserProfile extends UserProfile {
  phoneNumber?: string;
  gender?: string;
  dateOfBirth?: string;
  profilePicture?: string;
  profileImageBase64?: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, MapPickerComponent],
})
export class ProfilePage implements OnInit {
  @ViewChild('addressModal', { static: false }) addressModal!: IonModal;

  userProfile: ExtendedUserProfile | null = null;
  currentUser: any = null;
  addresses: Address[] = [];
  bookingPreferences: BookingPreferences = {
    preferredCategories: [],
    paymentMethod: 'cash',
    pushNotifications: true,
    emailNotifications: true,
    smsNotifications: false,
  };
  appSettings: AppSettings = {
    language: 'en',
    region: 'PH',
    darkMode: false,
  };

  isLoading = true;
  isEditingProfile = false;
  isAddingAddress = false;
  profileImageBase64: string | null = null;
  
  // Map-related properties
  selectedLocation: { lat: number; lng: number } | null = null;
  isLoadingAddress = false;
  addressFromCoordinates = '';

  // Form data
  profileForm = {
    fullName: '',
    email: '',
    phoneNumber: '',
    gender: '',
    dateOfBirth: '',
  };

  newAddress: Address = {
    label: 'Home',
    contactPerson: '',
    phoneNumber: '',
    fullAddress: '',
    isDefault: false,
    latitude: undefined,
    longitude: undefined,
    createdAt: new Date(),
  };

  serviceCategories = [
    { id: 'cleaning', name: 'Cleaning', icon: 'sparkles-outline' },
    { id: 'plumbing', name: 'Plumbing', icon: 'water-outline' },
    { id: 'electrical', name: 'Electrical', icon: 'flash-outline' },
    { id: 'gardening', name: 'Gardening', icon: 'leaf-outline' },
    { id: 'carpentry', name: 'Carpentry', icon: 'hammer-outline' },
    { id: 'painting', name: 'Painting', icon: 'brush-outline' },
    { id: 'laundry', name: 'Laundry', icon: 'shirt-outline' },
    { id: 'appliance', name: 'Appliances', icon: 'build-outline' },
  ];

  languages = [
    { code: 'en', name: 'English' },
    { code: 'fil', name: 'Filipino' },
    { code: 'es', name: 'Español' },
  ];

  regions = [
    { code: 'PH', name: 'Philippines' },
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private firestore: Firestore,
    private auth: Auth,
    private alertController: AlertController,
    private toastController: ToastController,
    private clientVerificationService: ClientVerificationService
  ) {}

  ngOnInit() {
    this.loadUserProfile();
  }

  async loadUserProfile() {
    try {
      // Get current user from auth
      this.auth.onAuthStateChanged(async (user) => {
        if (user) {
          this.currentUser = user;
          this.userProfile = await this.authService.getUserProfile(user.uid);
          if (this.userProfile) {
            this.profileForm = {
              fullName: this.userProfile.fullName || '',
              email: this.userProfile.email || '',
              phoneNumber: this.userProfile.phone || '',
              gender: '',
              dateOfBirth: '',
            };
          }
          // Load addresses and preferences after user is authenticated
          await this.loadAddresses();
          await this.loadPreferences();
          await this.loadClientVerificationImage();
        }
        this.isLoading = false;
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
      this.isLoading = false;
    }
  }

  async loadClientVerificationImage() {
    if (!this.currentUser?.uid) return;

    try {
      const verification =
        await this.clientVerificationService.getVerificationByUserId(
          this.currentUser.uid
        );

      if (verification && verification.profileImageBase64) {
        this.profileImageBase64 = verification.profileImageBase64;
        if (this.userProfile) {
          this.userProfile.profileImageBase64 = verification.profileImageBase64;
        }
      }
    } catch (error) {
      console.error('Error loading client verification image:', error);
    }
  }

  async loadAddresses() {
    if (!this.currentUser?.uid) {
      console.log('No current user, cannot load addresses');
      return;
    }

    try {
      console.log('Loading addresses for user:', this.currentUser.uid);
      const userRef = doc(this.firestore, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('User data retrieved:', userData);

        if (userData && userData['savedLocations']) {
          console.log('Found savedLocations:', userData['savedLocations']);
          this.addresses = userData['savedLocations'].map(
            (location: any, index: number) =>
              ({
                id: location.id || `address_${index}`,
                label: this.getAddressLabel(location),
                contactPerson: location.contactPerson || '',
                phoneNumber: location.phoneNumber || '',
                fullAddress: location.fullAddress || '',
                isDefault: location.isDefault || false,
                latitude: location.coordinates?.latitude,
                longitude: location.coordinates?.longitude,
                createdAt: location.createdAt
                  ? location.createdAt.toDate()
                  : new Date(),
              } as Address)
          );

          // Sort by creation date (newest first)
          this.addresses.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
          console.log('Mapped addresses:', this.addresses);
        } else {
          console.log('No savedLocations found in user data');
          this.addresses = [];
        }
      } else {
        console.log('User document does not exist');
        this.addresses = [];
      }
    } catch (error) {
      console.error('Error loading addresses:', error);
      this.addresses = [];
    }
  }

  private getAddressLabel(location: any): string {
    // Try to determine a label from the address
    if (location.label) return location.label;
    if (location.fullAddress) {
      const address = location.fullAddress.toLowerCase();
      if (address.includes('home') || address.includes('house')) return 'Home';
      if (address.includes('office') || address.includes('work'))
        return 'Office';
    }
    return 'Other';
  }

  async loadPreferences() {
    if (!this.currentUser?.uid) return;

    try {
      const preferencesRef = doc(
        this.firestore,
        `users/${this.currentUser.uid}/preferences/booking`
      );
      const docSnap = await getDoc(preferencesRef);

      if (docSnap.exists()) {
        this.bookingPreferences = {
          ...this.bookingPreferences,
          ...docSnap.data(),
        };
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  // Profile picture functionality can be added later with proper camera setup

  async saveProfile() {
    if (!this.currentUser?.uid) return;

    try {
      const userRef = doc(this.firestore, 'users', this.currentUser.uid);
      await updateDoc(userRef, {
        fullName: this.profileForm.fullName,
        phone: this.profileForm.phoneNumber,
        updatedAt: new Date(),
      });

      // Update local profile
      if (this.userProfile) {
        this.userProfile.fullName = this.profileForm.fullName;
        this.userProfile.phone = this.profileForm.phoneNumber;
      }

      this.isEditingProfile = false;
      this.showToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error('Error saving profile:', error);
      this.showToast('Error updating profile', 'danger');
    }
  }

  openAddressModal() {
    this.isAddingAddress = true;
    this.newAddress = {
      label: 'Home',
      contactPerson: this.userProfile?.fullName || '',
      phoneNumber: this.userProfile?.phone || '',
      fullAddress: '',
      isDefault: this.addresses.length === 0,
      latitude: undefined,
      longitude: undefined,
      createdAt: new Date(),
    };
    this.selectedLocation = null;
    this.addressFromCoordinates = '';
    this.addressModal.present();
  }

  async saveAddress() {
    if (!this.currentUser?.uid) return;

    // Validate required fields
    if (!this.newAddress.contactPerson || !this.newAddress.phoneNumber || !this.newAddress.fullAddress) {
      this.showToast('Please fill in all required fields', 'warning');
      return;
    }

    try {
      const userRef = doc(this.firestore, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        let savedLocations = userData['savedLocations'] || [];

        // If this is set as default, remove default from other addresses
        if (this.newAddress.isDefault) {
          savedLocations = savedLocations.map((location: any) => ({
            ...location,
            isDefault: false,
          }));
        }

        // Create new location object matching UserLocation interface
        const newLocation: any = {
          id: `location_${Date.now()}`,
          contactPerson: this.newAddress.contactPerson,
          phoneNumber: this.newAddress.phoneNumber,
          fullAddress: this.newAddress.fullAddress,
          isDefault: this.newAddress.isDefault,
          createdAt: new Date(),
          label: this.newAddress.label, // Add label for easier identification
        };

        // Only add coordinates if they exist (avoid undefined values)
        if (this.selectedLocation) {
          newLocation.coordinates = {
            latitude: this.selectedLocation.lat,
            longitude: this.selectedLocation.lng,
          };
        }

        // Add new location to the array
        savedLocations.push(newLocation);

        // Update the user document
        await updateDoc(userRef, {
          savedLocations: savedLocations,
        });

        await this.loadAddresses();
        this.addressModal.dismiss();
        this.isAddingAddress = false;
        this.showToast('Address added successfully!', 'success');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      this.showToast('Error saving address', 'danger');
    }
  }

  async deleteAddress(address: Address) {
    const alert = await this.alertController.create({
      header: 'Delete Address',
      message: 'Are you sure you want to delete this address?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              if (address.id && this.currentUser) {
                const userRef = doc(
                  this.firestore,
                  'users',
                  this.currentUser.uid
                );
                const userDoc = await getDoc(userRef);

                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  let savedLocations = userData['savedLocations'] || [];

                  // Filter out the address to delete
                  savedLocations = savedLocations.filter(
                    (location: any) => location.id !== address.id
                  );

                  // Update the user document
                  await updateDoc(userRef, {
                    savedLocations: savedLocations,
                  });

                  await this.loadAddresses();
                  this.showToast('Address deleted successfully!', 'success');
                }
              }
            } catch (error) {
              console.error('Error deleting address:', error);
              this.showToast('Error deleting address', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async setDefaultAddress(address: Address) {
    if (!this.currentUser?.uid || !address.id) return;

    try {
      const userRef = doc(this.firestore, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        let savedLocations = userData['savedLocations'] || [];

        // Update all addresses to remove default status, then set the selected one as default
        savedLocations = savedLocations.map((location: any) => ({
          ...location,
          isDefault: location.id === address.id,
        }));

        // Update the user document
        await updateDoc(userRef, {
          savedLocations: savedLocations,
        });

        await this.loadAddresses();
        this.showToast('Default address updated!', 'success');
      }
    } catch (error) {
      console.error('Error setting default address:', error);
      this.showToast('Error updating default address', 'danger');
    }
  }

  async savePreferences() {
    if (!this.currentUser?.uid) return;

    try {
      const preferencesRef = doc(
        this.firestore,
        `users/${this.currentUser.uid}/preferences/booking`
      );
      await setDoc(preferencesRef, this.bookingPreferences);

      this.showToast('Preferences saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.showToast('Error saving preferences', 'danger');
    }
  }

  togglePreferredCategory(categoryId: string) {
    const index =
      this.bookingPreferences.preferredCategories.indexOf(categoryId);
    if (index > -1) {
      this.bookingPreferences.preferredCategories.splice(index, 1);
    } else {
      this.bookingPreferences.preferredCategories.push(categoryId);
    }
    this.savePreferences();
  }

  async changePassword() {
    const alert = await this.alertController.create({
      header: 'Change Password',
      message: 'You will be redirected to reset your password via email.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Continue',
          handler: async () => {
            try {
              if (this.userProfile?.email) {
                await sendPasswordResetEmail(this.auth, this.userProfile.email);
                this.showToast('Password reset email sent!', 'success');
              }
            } catch (error) {
              console.error('Error sending password reset:', error);
              this.showToast('Error sending password reset email', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Logout',
          role: 'destructive',
          handler: async () => {
            await this.authService.logout();
            this.router.navigate(['/auth/login']);
          },
        },
      ],
    });

    await alert.present();
  }

  goBack() {
    this.router.navigate(['/pages/client/dashboard']);
  }

  async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top',
    });
    toast.present();
  }

  getHandyHomeId(): string {
    if (!this.userProfile?.uid) return '';
    return `HH${this.userProfile.uid.substring(0, 8).toUpperCase()}`;
  }

  // Map location selection handler
  async onLocationSelected(location: { lat: number; lng: number }) {
    this.selectedLocation = location;
    this.isLoadingAddress = true;
    
    try {
      // Convert coordinates to address using Nominatim
      const address = await this.reverseGeocode(location.lat, location.lng);
      this.addressFromCoordinates = address;
      
      // Auto-fill the full address field if it's empty
      if (!this.newAddress.fullAddress.trim()) {
        this.newAddress.fullAddress = address;
      }
    } catch (error) {
      console.error('Error getting address from coordinates:', error);
      this.addressFromCoordinates = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
    } finally {
      this.isLoadingAddress = false;
    }
  }

  // Reverse geocoding using Nominatim API
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
      );

      if (response.ok) {
        const data = await response.json();
        return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } else {
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  // Use address from coordinates
  useAddressFromCoordinates() {
    if (this.addressFromCoordinates) {
      this.newAddress.fullAddress = this.addressFromCoordinates;
    }
  }
}
