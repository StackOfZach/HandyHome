import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';

interface SubServicePrice {
  subServiceName: string;
  price: number;
}

interface ServiceWithPricing {
  categoryName: string;
  subServices: SubServicePrice[];
}

@Component({
  selector: 'app-update-profile',
  templateUrl: './update-profile.page.html',
  styleUrls: ['./update-profile.page.scss'],
  standalone: false,
})
export class UpdateProfilePage implements OnInit {
  profileForm: FormGroup;
  userProfile: UserProfile | null = null;
  workerProfile: WorkerProfile | null = null;
  serviceCategories: ServiceCategory[] = [];
  allowedServiceCategories: ServiceCategory[] = []; // Filtered to only main three scopes
  selectedPhoto: string | null = null;
  isLoading = false;

  // Define the three main service scopes
  readonly MAIN_SERVICE_SCOPES = ['Cleaning', 'Plumbing', 'Electrical'];

  // Time availability for each day
  timeAvailability: { [key: string]: { startTime: string; endTime: string } } =
    {};

  // Available days list
  availableDays = [
    { value: 'monday', label: 'Monday', icon: 'calendar' },
    { value: 'tuesday', label: 'Tuesday', icon: 'calendar' },
    { value: 'wednesday', label: 'Wednesday', icon: 'calendar' },
    { value: 'thursday', label: 'Thursday', icon: 'calendar' },
    { value: 'friday', label: 'Friday', icon: 'calendar' },
    { value: 'saturday', label: 'Saturday', icon: 'calendar' },
    { value: 'sunday', label: 'Sunday', icon: 'calendar' },
  ];

  constructor(
    private router: Router,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private workerService: WorkerService,
    private dashboardService: DashboardService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {
    this.profileForm = this.createProfileForm();
  }

  ngOnInit() {
    this.loadUserData();
    this.loadServiceCategories();
  }

  createProfileForm(): FormGroup {
    return this.formBuilder.group({
      fullName: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      fullAddress: [''],
      workRadius: [5, [Validators.min(1), Validators.max(50)]],
      availableDays: this.formBuilder.array([]),
      emergencyContact: [''],
      emergencyPhone: [''],
      bio: [''],
      skills: this.formBuilder.array([]),
      serviceWithPricing: this.formBuilder.array([]),
    });
  }

  async loadUserData() {
    this.authService.userProfile$.subscribe(async (profile) => {
      if (profile) {
        this.userProfile = profile;
        this.workerProfile = await this.workerService.getWorkerProfile(
          profile.uid
        );
        // Make sure service categories are loaded before populating form
        if (this.serviceCategories.length === 0) {
          await this.loadServiceCategories();
        }
        this.populateForm();
      }
    });
  }

  async loadServiceCategories() {
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();

      // Filter to only allow the three main service scopes
      this.allowedServiceCategories = this.serviceCategories.filter(
        (category) =>
          this.MAIN_SERVICE_SCOPES.some(
            (scope) => category.name.toLowerCase() === scope.toLowerCase()
          )
      );

      console.log('Loaded service categories:', this.serviceCategories.length);
      console.log(
        'Allowed service categories:',
        this.allowedServiceCategories.length
      );
    } catch (error) {
      console.error('Error loading service categories:', error);
    }
  }

  populateForm() {
    if (!this.workerProfile || !this.userProfile) return;

    this.profileForm.patchValue({
      fullName: this.userProfile.fullName || '',
      phone: this.userProfile.phone || '',
      fullAddress: this.workerProfile.fullAddress || '',
      workRadius: this.workerProfile.workRadius || 5,
      emergencyContact: this.workerProfile.emergencyContact || '',
      emergencyPhone: this.workerProfile.emergencyPhone || '',
      bio: (this.workerProfile as any).bio || '',
    });

    // Populate skills
    if (this.workerProfile.skills) {
      const skillsArray = this.profileForm.get('skills') as FormArray;
      skillsArray.clear();
      this.workerProfile.skills.forEach((skill) => {
        skillsArray.push(this.formBuilder.control(skill));
      });
    }

    // Populate service prices
    const serviceWithPricingArray = this.profileForm.get(
      'serviceWithPricing'
    ) as FormArray;
    serviceWithPricingArray.clear();

    let filteredOutCategories: string[] = [];
    if ((this.workerProfile as any).serviceWithPricing) {
      (this.workerProfile as any).serviceWithPricing.forEach(
        (svc: ServiceWithPricing) => {
          // Only include services within the allowed scopes
          if (!this.isAllowedCategory(svc.categoryName)) {
            console.warn(
              `Skipping disallowed category during form population: ${svc.categoryName}`
            );
            filteredOutCategories.push(svc.categoryName);
            return;
          }

          const subServicesControls: any[] = [];

          // Find the corresponding service category to get unit information
          const category = this.allowedServiceCategories.find(
            (c) => c.name === svc.categoryName
          );

          svc.subServices.forEach((s: SubServicePrice, subIndex: number) => {
            // Get the unit for this sub-service from the category
            const unit = category?.servicesPricing?.[subIndex] || 'per_hour';

            subServicesControls.push(
              this.formBuilder.group({
                subServiceName: [s.subServiceName, Validators.required],
                price: [s.price || 0, [Validators.required, Validators.min(0)]],
                unit: [unit], // Add unit information (read-only for workers)
              })
            );
          });

          serviceWithPricingArray.push(
            this.formBuilder.group({
              categoryName: [svc.categoryName, Validators.required],
              subServices: this.formBuilder.array(subServicesControls),
            })
          );
        }
      );
    }

    // Show warning if categories were filtered out
    if (filteredOutCategories.length > 0) {
      setTimeout(() => {
        this.showToast(
          `Some service categories (${filteredOutCategories.join(
            ', '
          )}) were removed as they are not within the main service scopes.`,
          'warning'
        );
      }, 1000);
    }

    // Populate available days
    const daysArray = this.profileForm.get('availableDays') as FormArray;
    daysArray.clear();
    const allDays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    allDays.forEach((day) => {
      const isSelected =
        this.workerProfile?.availableDays?.includes(day) || false;
      daysArray.push(this.formBuilder.control(isSelected));
    });

    if (this.workerProfile.profilePhotoData) {
      this.selectedPhoto = this.workerProfile.profilePhotoData;
    }

    // Load time availability
    if (this.workerProfile.timeAvailability) {
      this.timeAvailability = { ...this.workerProfile.timeAvailability };
    }
  }

  get skillsArray(): FormArray {
    return this.profileForm.get('skills') as FormArray;
  }

  get serviceWithPricingArray(): FormArray {
    return this.profileForm.get('serviceWithPricing') as FormArray;
  }

  get availableDaysArray(): FormArray {
    return this.profileForm.get('availableDays') as FormArray;
  }

  addSkill() {
    if (this.skillsArray.length < 3) {
      this.skillsArray.push(this.formBuilder.control('', Validators.required));
    }
  }

  removeSkill(index: number) {
    this.skillsArray.removeAt(index);
  }

  addServiceWithPricing() {
    this.serviceWithPricingArray.push(
      this.formBuilder.group({
        categoryName: ['', Validators.required],
        subServices: this.formBuilder.array([]),
      })
    );
  }

  removeServiceWithPricing(index: number) {
    this.serviceWithPricingArray.removeAt(index);
  }

  // When a category is selected, populate its sub-services into the form
  onCategorySelected(index: number, categoryName: string) {
    // Check if the selected category is within the allowed scopes
    if (!this.isAllowedCategory(categoryName)) {
      this.showToast(
        `Only ${this.MAIN_SERVICE_SCOPES.join(
          ', '
        )} services are allowed for pricing.`,
        'warning'
      );
      return;
    }

    const grp = this.serviceWithPricingArray.at(index) as FormGroup;
    grp.patchValue({ categoryName });

    // Clear existing sub-services and create new ones
    const subServicesControls: any[] = [];
    const category = this.allowedServiceCategories.find(
      (c) => c.name === categoryName
    );
    if (category && category.services && category.services.length) {
      category.services.forEach((sub, subIndex) => {
        // Get the unit for this sub-service from the category
        const unit = category.servicesPricing?.[subIndex] || 'per_hour';

        subServicesControls.push(
          this.formBuilder.group({
            subServiceName: [sub, Validators.required],
            price: [0, [Validators.required, Validators.min(0)]],
            unit: [unit], // Add unit information (read-only for workers)
          })
        );
      });
    }

    // Replace the entire subServices FormArray
    grp.setControl('subServices', this.formBuilder.array(subServicesControls));
  }

  /**
   * Check if a category is within the allowed service scopes
   */
  isAllowedCategory(categoryName: string): boolean {
    return this.MAIN_SERVICE_SCOPES.some(
      (scope) => scope.toLowerCase() === categoryName.toLowerCase()
    );
  }

  removeSubService(catIndex: number, subIndex: number) {
    const grp = this.serviceWithPricingArray.at(catIndex) as FormGroup;
    const subServicesFA = grp.get('subServices') as FormArray;
    subServicesFA.removeAt(subIndex);
  }

  // Helper method to get sub-services FormArray
  getSubServicesArray(svcCtrl: any): FormArray {
    return svcCtrl.get('subServices') as FormArray;
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedPhoto = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  getDayName(index: number): string {
    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    return days[index];
  }

  getAvailableSkills(): string[] {
    const skillsArray = this.profileForm.get('skills') as FormArray;
    return skillsArray.controls
      .map((control) => control.value)
      .filter((skill: string) => skill && skill.trim() !== '');
  }

  hasAvailableSkills(): boolean {
    return this.getAvailableSkills().length > 0;
  }

  /**
   * Toggle day availability and manage time availability
   */
  toggleDay(dayValue: string, isSelected: boolean) {
    if (isSelected) {
      // Add day with default time availability if not exists
      if (!this.timeAvailability[dayValue]) {
        this.timeAvailability[dayValue] = {
          startTime: '08:00',
          endTime: '17:00',
        };
      }
    } else {
      // Remove day's time availability
      delete this.timeAvailability[dayValue];
    }
  }

  /**
   * Check if day is selected
   */
  isDaySelected(dayValue: string): boolean {
    const dayIndex = this.availableDays.findIndex((d) => d.value === dayValue);
    if (dayIndex === -1) return false;

    const daysArray = this.profileForm.get('availableDays') as FormArray;
    return daysArray.at(dayIndex)?.value || false;
  }

  /**
   * Get selected days
   */
  getSelectedDays(): string[] {
    const selectedDays: string[] = [];
    const daysArray = this.profileForm.get('availableDays') as FormArray;

    daysArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDays.push(this.availableDays[index].value);
      }
    });

    return selectedDays;
  }

  /**
   * Update time availability for a specific day
   */
  updateTimeAvailability(
    day: string,
    timeType: 'startTime' | 'endTime',
    value: string
  ) {
    if (!this.timeAvailability[day]) {
      this.timeAvailability[day] = { startTime: '08:00', endTime: '17:00' };
    }
    this.timeAvailability[day][timeType] = value;
  }

  /**
   * Get time availability for a day
   */
  getTimeAvailability(day: string): { startTime: string; endTime: string } {
    return (
      this.timeAvailability[day] || { startTime: '08:00', endTime: '17:00' }
    );
  }

  /**
   * Handle day checkbox change
   */
  onDayChange(dayIndex: number, event: any) {
    const dayValue = this.availableDays[dayIndex].value;
    const isSelected = event.detail.checked;
    this.toggleDay(dayValue, isSelected);
  }

  /**
   * Get display unit for pricing (convert 'per_hour' to '/hour')
   */
  getDisplayUnit(unit: string): string {
    switch (unit) {
      case 'per_hour':
        return '/hour';
      case 'per_day':
        return '/day';
      default:
        return '/hour';
    }
  }

  async saveProfile() {
    if (this.profileForm.valid && this.userProfile) {
      const loading = await this.loadingController.create({
        message: 'Updating profile...',
      });
      await loading.present();

      try {
        const formValue = this.profileForm.value;

        // Process available days
        const selectedDays: string[] = [];
        const allDays = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];
        formValue.availableDays.forEach(
          (isSelected: boolean, index: number) => {
            if (isSelected) {
              selectedDays.push(allDays[index]);
            }
          }
        );

        // Validate and filter service pricing to only allowed categories
        const validatedServiceWithPricing = (formValue.serviceWithPricing || [])
          .filter((svc: any) => {
            // Only allow categories within the three main scopes
            if (!this.isAllowedCategory(svc.categoryName)) {
              console.warn(
                `Filtering out disallowed category: ${svc.categoryName}`
              );
              return false;
            }
            return true;
          })
          .map((svc: any) => ({
            categoryName: svc.categoryName,
            subServices: (svc.subServices || [])
              .filter((s: any) => s.subServiceName && s.price >= 0)
              .map((s: any) => ({
                subServiceName: s.subServiceName,
                price: s.price,
              })),
          }))
          .filter((svc: any) => svc.subServices.length > 0);

        // Prepare worker profile data
        const workerData: Partial<WorkerProfile & any> = {
          fullAddress: formValue.fullAddress,
          workRadius: formValue.workRadius,
          skills: formValue.skills.filter(
            (skill: string) => skill.trim() !== ''
          ),
          availableDays: selectedDays,
          timeAvailability: { ...this.timeAvailability },
          emergencyContact: formValue.emergencyContact,
          emergencyPhone: formValue.emergencyPhone,
          bio: formValue.bio,
          serviceWithPricing: validatedServiceWithPricing,
          updatedAt: new Date(),
        };

        if (this.selectedPhoto) {
          workerData['profilePhotoData'] = this.selectedPhoto;
        }

        // Update user profile
        await this.authService.updateUserProfile({
          fullName: formValue.fullName,
          phone: formValue.phone,
        });

        // Update worker profile
        await this.workerService.updateWorkerProfile(
          this.userProfile.uid,
          workerData
        );

        await loading.dismiss();
        await this.showToast('Profile updated successfully!', 'success');
        this.router.navigate(['/pages/worker/dashboard']);
      } catch (error) {
        await loading.dismiss();
        console.error('Error updating profile:', error);
        await this.showToast(
          'Error updating profile. Please try again.',
          'danger'
        );
      }
    } else {
      await this.showToast(
        'Please fill in all required fields correctly.',
        'warning'
      );
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastController.create({
      message,
      color,
      duration: 3000,
      position: 'top',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }
}
