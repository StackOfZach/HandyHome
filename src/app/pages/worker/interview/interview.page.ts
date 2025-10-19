import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  LoadingController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
// Camera functionality using HTML5 API for web compatibility

// Services
import { AuthService } from '../../../services/auth.service';
import { WorkerService } from '../../../services/worker.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';

// Components
import { MapPickerComponent } from '../../../components/map-picker/map-picker.component';

// Interfaces
export interface ServicePrice {
  name: string;
  minPrice: number;
  maxPrice: number;
}

export interface WorkerProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  fullAddress?: string;
  location?: {
    lat: number;
    lng: number;
  };
  skills?: string[];
  servicePrices?: ServicePrice[]; // Service pricing information
  workRadius?: number;
  availableDays?: string[];
  idPhotoUrl?: string;
  profilePhotoUrl?: string;
  idPhotoData?: string; // Base64 image data for temporary storage
  profilePhotoData?: string; // Base64 image data for temporary storage
  certificates?: { [skillName: string]: string }; // Base64 certificate data for each skill
  certificateUrls?: { [skillName: string]: string }; // URLs for uploaded certificates
  status?: 'pending_verification' | 'verified' | 'rejected';
  createdAt: Date;
  currentStep?: number;
  emergencyContact?: string;
  emergencyPhone?: string;
  interviewCompletedAt?: Date;
  verifiedAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-interview',
  templateUrl: './interview.page.html',
  styleUrls: ['./interview.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule, MapPickerComponent],
})
export class InterviewPage implements OnInit, OnDestroy {
  currentStep = 1;
  totalSteps = 5;

  // Form groups for each step
  personalInfoForm!: FormGroup;
  skillsForm!: FormGroup;
  certificateForm!: FormGroup;
  verificationForm!: FormGroup;

  // Worker profile data
  workerProfile: Partial<WorkerProfile> = {};

  // Loading states
  isLoading = false;
  isSaving = false;

  // Map related
  mapReady = false;
  selectedLocation: { lat: number; lng: number } | null = null;

  // Skills and services
  serviceCategories: ServiceCategory[] = [];
  availableServices: string[] = [];
  isLoadingServices = false;

  // Available days
  availableDays = [
    { value: 'monday', label: 'Monday', icon: 'calendar' },
    { value: 'tuesday', label: 'Tuesday', icon: 'calendar' },
    { value: 'wednesday', label: 'Wednesday', icon: 'calendar' },
    { value: 'thursday', label: 'Thursday', icon: 'calendar' },
    { value: 'friday', label: 'Friday', icon: 'calendar' },
    { value: 'saturday', label: 'Saturday', icon: 'calendar' },
    { value: 'sunday', label: 'Sunday', icon: 'calendar' },
  ];

  // Photo previews
  idPhotoPreview: string | null = null;
  profilePhotoPreview: string | null = null;

  // Certificate related
  selectedSkills: string[] = [];
  certificatePreviews: { [skillName: string]: string } = {};
  certificateRequirements: { [skillName: string]: string } = {
    'House Cleaning': 'Cleaning certification or training certificate',
    Plumbing: 'Plumbing license or trade certification',
    'Electrical Work': 'Electrical license or certification',
    Carpentry: 'Carpentry certification or trade certificate',
    Painting: 'Painting certification or portfolio of work',
    Gardening: 'Landscaping or gardening certification',
    'Appliance Repair': 'Appliance repair certification or technical training',
    'AC Maintenance': 'HVAC certification or air conditioning license',
    'Pest Control': 'Pest control license or certification',
    'Home Security': 'Security system installation certification',
    'Moving Services': 'Moving company certification or insurance',
    'General Handyman': 'General trade certification or portfolio',
  };

  // Service pricing
  servicePrices: { [skillName: string]: { min: number; max: number } } = {};

  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private workerService: WorkerService,
    private dashboardService: DashboardService,
    private router: Router,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.initializeForms();
  }

  ngOnInit() {
    this.loadWorkerProfile();
    this.loadServiceCategories();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  /**
   * Initialize all form groups
   */
  private initializeForms() {
    // Step 1: Personal Information
    this.personalInfoForm = this.fb.group({
      fullAddress: ['', [Validators.required, Validators.minLength(10)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10,11}$/)]],
      emergencyContact: ['', [Validators.required]],
      emergencyPhone: [
        '',
        [Validators.required, Validators.pattern(/^[0-9]{10,11}$/)],
      ],
    });

    // Step 2: Skills & Services
    this.skillsForm = this.fb.group({
      skills: [[], Validators.required],
      customSkill: [''],
      workRadius: [
        5,
        [Validators.required, Validators.min(1), Validators.max(50)],
      ],
      availableDays: [[], Validators.required],
    });

    // Step 3: Certificate Upload
    this.certificateForm = this.fb.group({});

    // Step 4: Identity Verification
    this.verificationForm = this.fb.group({
      idPhoto: [null, Validators.required],
      profilePhoto: [null, Validators.required],
    });
  }

  /**
   * Load existing worker profile if any
   */
  private async loadWorkerProfile() {
    const loading = await this.loadingController.create({
      message: 'Loading profile...',
    });
    await loading.present();

    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.router.navigate(['/pages/auth/login']);
        return;
      }

      const profile = await this.workerService.getWorkerProfile(user.uid);
      if (profile) {
        // Check if worker is already verified and completed interview
        if (profile.verifiedAt && profile.status === 'verified') {
          console.log('Worker is already verified, redirecting to dashboard');
          this.router.navigate(['/pages/worker/dashboard']);
          return;
        }

        this.workerProfile = profile;
        this.currentStep = profile.currentStep || 1;
        this.populateFormsFromProfile(profile);
      } else {
        // Initialize with basic info from auth service
        const userProfile = this.authService.getCurrentUserProfile();
        if (userProfile) {
          this.workerProfile = {
            uid: userProfile.uid,
            fullName: userProfile.fullName,
            email: userProfile.email,
            phone: userProfile.phone,
            currentStep: 1,
            status: 'pending_verification',
            createdAt: new Date(),
          };
        }
      }
    } catch (error) {
      console.error('Error loading worker profile:', error);
      this.showErrorAlert('Failed to load profile');
    } finally {
      loading.dismiss();
    }
  }

  /**
   * Load service categories from Firestore
   */
  async loadServiceCategories() {
    this.isLoadingServices = true;
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
      // Extract only the names of active service categories for the availableServices array
      this.availableServices = this.serviceCategories
        .filter((category) => category.isActive)
        .map((category) => category.name);
      console.log('Loaded service categories:', this.serviceCategories);
      console.log('Available services:', this.availableServices);
    } catch (error) {
      console.error('Error loading service categories:', error);
      // Fallback to hardcoded services if Firestore fails
      this.availableServices = [
        'House Cleaning',
        'Plumbing',
        'Electrical Work',
        'Carpentry',
        'Painting',
        'Gardening',
        'Appliance Repair',
        'AC Maintenance',
        'Pest Control',
        'Home Security',
        'Moving Services',
        'General Handyman',
      ];
    } finally {
      this.isLoadingServices = false;
    }
  }

  /**
   * Populate forms with existing profile data
   */
  private populateFormsFromProfile(profile: WorkerProfile) {
    // Personal info form
    this.personalInfoForm.patchValue({
      fullAddress: profile.fullAddress || '',
      phone: profile.phone || '',
      emergencyContact: profile.emergencyContact || '',
      emergencyPhone: profile.emergencyPhone || '',
    });

    // Skills form
    this.skillsForm.patchValue({
      skills: profile.skills || [],
      workRadius: profile.workRadius || 5,
      availableDays: profile.availableDays || [],
    });

    // Update selected skills for certificate form
    this.selectedSkills = profile.skills || [];
    this.updateCertificateForm();

    // Certificate form - restore certificate previews if they exist
    if (profile.certificates) {
      this.certificatePreviews = profile.certificates;
    }

    // Service prices - restore pricing if they exist
    if (profile.servicePrices) {
      profile.servicePrices.forEach((priceData) => {
        this.servicePrices[priceData.name] = {
          min: priceData.minPrice,
          max: priceData.maxPrice,
        };
      });
    }

    // Update certificate form after loading data
    if (profile.certificates || profile.servicePrices) {
      this.updateCertificateForm();
    }

    // Verification form - restore photo previews if they exist
    if (profile.idPhotoData) {
      this.idPhotoPreview = profile.idPhotoData;
      this.verificationForm.patchValue({
        idPhoto: profile.idPhotoData,
      });
    }

    if (profile.profilePhotoData) {
      this.profilePhotoPreview = profile.profilePhotoData;
      this.verificationForm.patchValue({
        profilePhoto: profile.profilePhotoData,
      });
    }

    // Set selected location
    if (profile.location) {
      this.selectedLocation = profile.location;
    }

    console.log('Populated forms with profile data:', profile);
  }

  /**
   * Navigate to next step
   */
  async nextStep() {
    if (await this.validateCurrentStep()) {
      await this.saveCurrentStep();
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
      }
    }
  }

  /**
   * Navigate to previous step
   */
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  /**
   * Go back to previous page
   */
  goBack() {
    this.router.navigate(['/pages/auth/login']);
  }

  /**
   * Validate current step form
   */
  private async validateCurrentStep(): Promise<boolean> {
    switch (this.currentStep) {
      case 1:
        if (!this.personalInfoForm.valid) {
          this.showValidationErrors(this.personalInfoForm);
          return false;
        }
        if (!this.selectedLocation) {
          this.showErrorToast('Please pin your location on the map');
          return false;
        }
        return true;

      case 2:
        if (!this.skillsForm.valid) {
          this.showValidationErrors(this.skillsForm);
          return false;
        }
        const skills = this.skillsForm.get('skills')?.value;
        if (!skills || skills.length === 0) {
          this.showErrorToast('Please select at least one skill');
          return false;
        }
        const availableDays = this.skillsForm.get('availableDays')?.value;
        if (!availableDays || availableDays.length === 0) {
          this.showErrorToast('Please select at least one day of availability');
          return false;
        }
        return true;

      case 3:
        // Validate certificates and pricing for selected skills
        const selectedSkills = this.skillsForm.get('skills')?.value || [];
        for (const skill of selectedSkills) {
          if (!this.certificateForm.get(skill)?.value) {
            this.showErrorToast(`Please upload certificate for ${skill}`);
            return false;
          }

          const minPrice = this.certificateForm.get(skill + '_minPrice')?.value;
          const maxPrice = this.certificateForm.get(skill + '_maxPrice')?.value;

          if (!minPrice || minPrice <= 0) {
            this.showErrorToast(`Please set minimum price for ${skill}`);
            return false;
          }

          if (!maxPrice || maxPrice <= 0) {
            this.showErrorToast(`Please set maximum price for ${skill}`);
            return false;
          }

          if (Number(minPrice) >= Number(maxPrice)) {
            this.showErrorToast(
              `Maximum price must be greater than minimum price for ${skill}`
            );
            return false;
          }
        }
        return true;

      case 4:
        if (!this.verificationForm.valid) {
          this.showValidationErrors(this.verificationForm);
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Save current step data
   */
  private async saveCurrentStep() {
    const loading = await this.loadingController.create({
      message: 'Saving...',
    });
    await loading.present();

    try {
      const updateData: Partial<WorkerProfile> = {
        currentStep: this.currentStep,
        updatedAt: new Date(),
      };

      switch (this.currentStep) {
        case 1:
          const personalData = this.personalInfoForm.value;
          updateData.fullAddress = personalData.fullAddress;
          updateData.phone = personalData.phone;
          updateData.location = this.selectedLocation!;
          updateData.emergencyContact = personalData.emergencyContact;
          updateData.emergencyPhone = personalData.emergencyPhone;
          console.log('Saving Step 1 data:', updateData);
          break;

        case 2:
          const skillsData = this.skillsForm.value;
          updateData.skills = [...(skillsData.skills || [])];
          updateData.workRadius = skillsData.workRadius;
          updateData.availableDays = [...(skillsData.availableDays || [])];

          // Add custom skill if provided
          if (skillsData.customSkill && skillsData.customSkill.trim()) {
            updateData.skills = [
              ...(updateData.skills || []),
              skillsData.customSkill.trim(),
            ];
          }
          console.log('Saving Step 2 data:', updateData);
          break;

        case 3:
          // Save certificate data and pricing
          const certificateData = this.certificateForm.value;

          // Extract certificates (non-pricing fields)
          const certificates: any = {};
          const servicePrices: any[] = [];

          Object.keys(certificateData).forEach((key) => {
            if (key.endsWith('_minPrice') || key.endsWith('_maxPrice')) {
              // Handle pricing data
              const skillName = key
                .replace('_minPrice', '')
                .replace('_maxPrice', '');
              const existingPrice = servicePrices.find(
                (p) => p.name === skillName
              );

              if (!existingPrice) {
                servicePrices.push({
                  name: skillName,
                  minPrice: 0,
                  maxPrice: 0,
                });
              }

              const priceEntry = servicePrices.find(
                (p) => p.name === skillName
              );
              if (key.endsWith('_minPrice')) {
                priceEntry.minPrice = Number(certificateData[key]) || 0;
              } else {
                priceEntry.maxPrice = Number(certificateData[key]) || 0;
              }
            } else {
              // Handle certificate files
              certificates[key] = certificateData[key];
            }
          });

          updateData.certificates = certificates;
          updateData.servicePrices = servicePrices;
          console.log(
            'Saving Step 3 data (certificates and pricing):',
            updateData
          );
          break;

        case 4:
          // Save photo data temporarily as base64
          const verificationData = this.verificationForm.value;
          if (verificationData.idPhoto) {
            updateData.idPhotoData = verificationData.idPhoto;
          }
          if (verificationData.profilePhoto) {
            updateData.profilePhotoData = verificationData.profilePhoto;
          }
          console.log('Saving Step 4 data (photos saved as base64)');
          break;
      }

      await this.workerService.updateWorkerProfile(
        this.workerProfile.uid!,
        updateData
      );
      this.workerProfile = { ...this.workerProfile, ...updateData };

      this.showSuccessToast('Progress saved successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      this.showErrorAlert('Failed to save progress');
      throw error;
    } finally {
      loading.dismiss();
    }
  }

  /**
   * Handle map location selection
   */
  onLocationSelected(location: { lat: number; lng: number }) {
    this.selectedLocation = location;
  }

  /**
   * Get progress percentage
   */
  getProgressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  /**
   * Show validation errors
   */
  private showValidationErrors(form: FormGroup) {
    Object.keys(form.controls).forEach((key) => {
      const control = form.get(key);
      if (control && control.invalid) {
        control.markAsTouched();
      }
    });
  }

  /**
   * Show error alert
   */
  private async showErrorAlert(message: string) {
    const alert = await this.alertController.create({
      header: 'Error',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Show success toast
   */
  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }

  /**
   * Show error toast
   */
  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  /**
   * Validate all interview data before submission
   */
  private validateAllData(): boolean {
    // Check personal information
    if (!this.personalInfoForm.valid) {
      console.error(
        'Personal info form is invalid:',
        this.personalInfoForm.errors
      );
      return false;
    }

    if (!this.selectedLocation) {
      console.error('Location not selected');
      return false;
    }

    // Check skills and availability
    if (!this.skillsForm.valid) {
      console.error('Skills form is invalid:', this.skillsForm.errors);
      return false;
    }

    const skills = this.skillsForm.get('skills')?.value;
    if (!skills || skills.length === 0) {
      console.error('No skills selected');
      return false;
    }

    const availableDays = this.skillsForm.get('availableDays')?.value;
    if (!availableDays || availableDays.length === 0) {
      console.error('No available days selected');
      return false;
    }

    // Check verification photos
    if (!this.verificationForm.valid) {
      console.error(
        'Verification form is invalid:',
        this.verificationForm.errors
      );
      return false;
    }

    if (!this.idPhotoPreview || !this.profilePhotoPreview) {
      console.error('Photos missing');
      return false;
    }

    return true;
  }

  /**
   * Get all interview data for debugging
   */
  getAllInterviewData() {
    return {
      personalInfo: this.personalInfoForm.value,
      skills: this.skillsForm.value,
      verification: {
        hasIdPhoto: !!this.idPhotoPreview,
        hasProfilePhoto: !!this.profilePhotoPreview,
      },
      location: this.selectedLocation,
      workerProfile: this.workerProfile,
      currentStep: this.currentStep,
    };
  }

  /**
   * Toggle skill selection (limited to 3 services maximum)
   */
  toggleSkill(skill: string) {
    const currentSkills = this.skillsForm.get('skills')?.value || [];
    const index = currentSkills.indexOf(skill);

    if (index > -1) {
      // Remove skill
      currentSkills.splice(index, 1);
    } else {
      // Check if we can add more skills (limit to 3)
      if (currentSkills.length < 3) {
        // Add skill
        currentSkills.push(skill);
      } else {
        // Show toast message when limit is reached
        this.showToast(
          'You can select a maximum of 3 services only.',
          'warning'
        );
        return;
      }
    }

    this.skillsForm.patchValue({ skills: currentSkills });

    // Update selected skills and certificate form
    this.selectedSkills = currentSkills;
    this.updateCertificateForm();
  }

  /**
   * Check if skill is selected
   */
  isSkillSelected(skill: string): boolean {
    const currentSkills = this.skillsForm.get('skills')?.value || [];
    return currentSkills.includes(skill);
  }

  /**
   * Get selected skills array
   */
  getSelectedSkills(): string[] {
    return this.skillsForm.get('skills')?.value || [];
  }

  /**
   * Check if maximum service selection limit is reached
   */
  isSelectionLimitReached(): boolean {
    return this.getSelectedSkills().length >= 3;
  }

  /**
   * Toggle day availability
   */
  toggleDay(day: string) {
    const currentDays = this.skillsForm.get('availableDays')?.value || [];
    const dayIndex = currentDays.indexOf(day);

    if (dayIndex > -1) {
      currentDays.splice(dayIndex, 1);
    } else {
      currentDays.push(day);
    }

    this.skillsForm.patchValue({ availableDays: currentDays });
  }

  /**
   * Check if day is selected
   */
  isDaySelected(day: string): boolean {
    const currentDays = this.skillsForm.get('availableDays')?.value || [];
    return currentDays.includes(day);
  }

  /**
   * Get selected days array
   */
  getSelectedDays(): string[] {
    return this.skillsForm.get('availableDays')?.value || [];
  }

  /**
   * Update certificate form based on selected skills
   */
  updateCertificateForm() {
    const certificateControls: any = {};

    // Create form controls for each selected skill
    this.selectedSkills.forEach((skill) => {
      const existingValue = this.certificatePreviews[skill] || null;
      certificateControls[skill] = [existingValue, Validators.required];

      // Add pricing controls for each skill
      certificateControls[skill + '_minPrice'] = [
        this.servicePrices[skill]?.min || '',
        [Validators.required, Validators.min(1)],
      ];
      certificateControls[skill + '_maxPrice'] = [
        this.servicePrices[skill]?.max || '',
        [Validators.required, Validators.min(1)],
      ];
    });

    // Remove certificates and pricing for unselected skills
    Object.keys(this.certificatePreviews).forEach((skill) => {
      if (!this.selectedSkills.includes(skill)) {
        delete this.certificatePreviews[skill];
        delete this.servicePrices[skill];
      }
    });

    this.certificateForm = this.fb.group(certificateControls);
  }

  /**
   * Upload certificate for a specific skill
   */
  async uploadCertificate(skillName: string) {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.multiple = false;

      input.onchange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
          // Check file size (limit to 5MB)
          if (file.size > 5 * 1024 * 1024) {
            this.showErrorToast('File size should not exceed 5MB');
            return;
          }

          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.certificatePreviews[skillName] = e.target.result;
            this.certificateForm.get(skillName)?.setValue(e.target.result);
            this.showSuccessToast(
              `Certificate for ${skillName} uploaded successfully`
            );
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error uploading certificate:', error);
      this.showErrorToast('Failed to upload certificate. Please try again.');
    }
  }

  /**
   * Check if certificate is uploaded for a skill
   */
  isCertificateUploaded(skillName: string): boolean {
    return !!this.certificatePreviews[skillName];
  }

  /**
   * Get certificate requirement text for a skill
   */
  getCertificateRequirement(skillName: string): string {
    return (
      this.certificateRequirements[skillName] ||
      'Valid certification or license for this service'
    );
  }

  /**
   * Remove uploaded certificate for a skill
   */
  removeCertificate(skillName: string) {
    delete this.certificatePreviews[skillName];
    this.certificateForm.get(skillName)?.setValue(null);
    this.showSuccessToast(`Certificate for ${skillName} removed`);
  }

  /**
   * Update service pricing
   */
  updateServicePrice(
    skillName: string,
    type: 'min' | 'max',
    value: string | number | null | undefined
  ) {
    // Convert value to number, default to 0 if invalid
    const numericValue =
      typeof value === 'string'
        ? parseFloat(value) || 0
        : typeof value === 'number'
        ? value
        : 0;

    if (!this.servicePrices[skillName]) {
      this.servicePrices[skillName] = { min: 0, max: 0 };
    }
    this.servicePrices[skillName][type] = numericValue;

    // Validate that max is greater than min
    if (
      type === 'min' &&
      this.servicePrices[skillName].max > 0 &&
      numericValue >= this.servicePrices[skillName].max
    ) {
      this.showErrorToast('Minimum price must be less than maximum price');
      return;
    }
    if (
      type === 'max' &&
      this.servicePrices[skillName].min > 0 &&
      numericValue <= this.servicePrices[skillName].min
    ) {
      this.showErrorToast('Maximum price must be greater than minimum price');
      return;
    }
  }

  /**
   * Get service price for a skill
   */
  getServicePrice(skillName: string): { min: number; max: number } {
    return this.servicePrices[skillName] || { min: 0, max: 0 };
  }

  /**
   * Get service pricing keys that have been set
   */
  getServicePricingKeys(): string[] {
    return Object.keys(this.servicePrices).filter(
      (skill) =>
        this.servicePrices[skill].min > 0 || this.servicePrices[skill].max > 0
    );
  }

  /**
   * Get uploaded certificates count
   */
  getUploadedCertificatesCount(): number {
    return Object.keys(this.certificatePreviews).length;
  }

  /**
   * Check if all required certificates are uploaded
   */
  areAllCertificatesUploaded(): boolean {
    return (
      Object.keys(this.certificatePreviews).length ===
      this.selectedSkills.length
    );
  }

  /**
   * Get certificates keys for iteration in template
   */
  getCertificateKeys(): string[] {
    return Object.keys(this.certificatePreviews);
  }

  /**
   * Capture ID photo using camera
   */
  async captureIdPhoto() {
    try {
      // Create a file input element for camera access
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use back camera for ID photos

      input.onchange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.idPhotoPreview = e.target.result;
            this.verificationForm.patchValue({ idPhoto: e.target.result });
            this.showSuccessToast('ID photo captured successfully');
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error capturing ID photo:', error);
      this.showErrorToast('Failed to access camera. Please try again.');
    }
  }

  /**
   * Capture profile photo using camera
   */
  async captureProfilePhoto() {
    try {
      // Create a file input element for camera access
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user'; // Use front camera for selfies

      input.onchange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.profilePhotoPreview = e.target.result;
            this.verificationForm.patchValue({ profilePhoto: e.target.result });
            this.showSuccessToast('Profile photo captured successfully');
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error capturing profile photo:', error);
      this.showErrorToast('Failed to access camera. Please try again.');
    }
  }

  /**
   * Submit completed interview
   */
  async submitInterview() {
    if (!(await this.validateCurrentStep())) {
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Submitting application...',
    });
    await loading.present();

    try {
      // Save final step data first
      await this.saveCurrentStep();

      // Prepare final submission data with all interview information
      const finalSubmissionData: Partial<WorkerProfile> = {
        currentStep: 5,
        status: 'pending_verification',
        interviewCompletedAt: new Date(),
        updatedAt: new Date(),

        // Include all completed data
        fullAddress: this.personalInfoForm.get('fullAddress')?.value,
        phone: this.personalInfoForm.get('phone')?.value,
        emergencyContact: this.personalInfoForm.get('emergencyContact')?.value,
        emergencyPhone: this.personalInfoForm.get('emergencyPhone')?.value,
        location: this.selectedLocation!,

        skills: this.skillsForm.get('skills')?.value || [],
        workRadius: this.skillsForm.get('workRadius')?.value || 5,
        availableDays: this.skillsForm.get('availableDays')?.value || [],

        certificates: this.certificateForm.value || {},

        idPhotoData: this.verificationForm.get('idPhoto')?.value,
        profilePhotoData: this.verificationForm.get('profilePhoto')?.value,
      };

      // Add service pricing data
      const servicePricesArray: ServicePrice[] = [];
      Object.keys(this.servicePrices).forEach((skillName) => {
        const pricing = this.servicePrices[skillName];
        if (pricing.min > 0 || pricing.max > 0) {
          servicePricesArray.push({
            name: skillName,
            minPrice: pricing.min,
            maxPrice: pricing.max,
          });
        }
      });

      if (servicePricesArray.length > 0) {
        finalSubmissionData.servicePrices = servicePricesArray;
      }

      // Add custom skill if provided
      const customSkill = this.skillsForm.get('customSkill')?.value;
      if (customSkill && customSkill.trim()) {
        finalSubmissionData.skills = [
          ...(finalSubmissionData.skills || []),
          customSkill.trim(),
        ];
      }

      console.log('Final submission data:', finalSubmissionData);

      // Complete the interview process with all data
      await this.workerService.updateWorkerProfile(
        this.workerProfile.uid!,
        finalSubmissionData
      );

      loading.dismiss();

      // Show success message and logout
      const alert = await this.alertController.create({
        header: 'Application Submitted!',
        message:
          'Your worker application has been submitted successfully. You will be notified once it has been reviewed by our team. Please log in again to check your application status.',
        buttons: [
          {
            text: 'OK',
            handler: async () => {
              try {
                // Log out the user to clear their session
                await this.authService.logout();
              } catch (error) {
                console.error('Error during logout:', error);
                // Fallback to manual navigation if logout fails
                this.router.navigate(['/pages/auth/login']);
              }
            },
          },
        ],
      });
      await alert.present();
    } catch (error) {
      loading.dismiss();
      console.error('Error submitting interview:', error);
      this.showErrorAlert('Failed to submit application. Please try again.');
    }
  }

  /**
   * Show toast message
   */
  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
