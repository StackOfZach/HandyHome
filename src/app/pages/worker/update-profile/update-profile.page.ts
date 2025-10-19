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

interface ServiceWithPrice {
  name: string;
  minPrice: number;
  maxPrice: number;
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
  selectedPhoto: string | null = null;
  isLoading = false;

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
      servicePrices: this.formBuilder.array([]),
    });
  }

  async loadUserData() {
    this.authService.userProfile$.subscribe(async (profile) => {
      if (profile) {
        this.userProfile = profile;
        this.workerProfile = await this.workerService.getWorkerProfile(
          profile.uid
        );
        this.populateForm();
      }
    });
  }

  async loadServiceCategories() {
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
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
    const servicePricesArray = this.profileForm.get(
      'servicePrices'
    ) as FormArray;
    servicePricesArray.clear();
    if ((this.workerProfile as any).servicePrices) {
      (this.workerProfile as any).servicePrices.forEach(
        (service: ServiceWithPrice) => {
          servicePricesArray.push(
            this.formBuilder.group({
              name: [service.name, Validators.required],
              minPrice: [
                service.minPrice,
                [Validators.required, Validators.min(1)],
              ],
              maxPrice: [
                service.maxPrice,
                [Validators.required, Validators.min(1)],
              ],
            })
          );
        }
      );
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
  }

  get skillsArray(): FormArray {
    return this.profileForm.get('skills') as FormArray;
  }

  get servicePricesArray(): FormArray {
    return this.profileForm.get('servicePrices') as FormArray;
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

  addServicePrice() {
    this.servicePricesArray.push(
      this.formBuilder.group({
        name: ['', Validators.required],
        minPrice: [0, [Validators.required, Validators.min(1)]],
        maxPrice: [0, [Validators.required, Validators.min(1)]],
      })
    );
  }

  removeServicePrice(index: number) {
    this.servicePricesArray.removeAt(index);
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

        // Prepare worker profile data
        const workerData: Partial<WorkerProfile & any> = {
          fullAddress: formValue.fullAddress,
          workRadius: formValue.workRadius,
          skills: formValue.skills.filter(
            (skill: string) => skill.trim() !== ''
          ),
          availableDays: selectedDays,
          emergencyContact: formValue.emergencyContact,
          emergencyPhone: formValue.emergencyPhone,
          bio: formValue.bio,
          servicePrices: formValue.servicePrices.filter(
            (service: any) =>
              service.name.trim() !== '' &&
              service.minPrice > 0 &&
              service.maxPrice > 0 &&
              service.maxPrice >= service.minPrice
          ),
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
