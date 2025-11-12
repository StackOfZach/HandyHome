import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { LoadingController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { TermsPrivacyModalComponent } from '../../../components/terms-privacy-modal/terms-privacy-modal.component';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    TermsPrivacyModalComponent,
  ],
})
export class SignupPage implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  showTermsModal = false;
  showPassword = false;
  showConfirmPassword = false;
  private hasRedirected = false; // Flag to prevent multiple redirects

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router
  ) {
    this.signupForm = this.formBuilder.group(
      {
        fullName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        phone: [
          '',
          [
            Validators.required,
            Validators.pattern(/^[0-9]{11}$/),
            Validators.minLength(11),
            Validators.maxLength(11),
          ],
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['client', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  async ngOnInit() {
    // Check if user is already logged in and offer them options
    if (this.authService.isAuthenticated()) {
      const profile = this.authService.getCurrentUserProfile();
      if (profile) {
        console.log(
          'SignupPage: User already authenticated with role:',
          profile.role
        );
        // Don't auto-redirect, let them choose what to do
        // They might want to create a new account or logout first
      }
    }

    // Listen for authentication changes during signup process
    this.authService.currentUser$.subscribe(async (user) => {
      // Only redirect if this is a fresh signup (not an existing session)
      if (user && !this.hasRedirected && this.isLoading) {
        const profile = this.authService.getCurrentUserProfile();
        if (profile) {
          console.log(
            'SignupPage: User authenticated during signup, redirecting...'
          );
          this.hasRedirected = true;
          await this.redirectBasedOnRole(profile.role);
        }
      }
    });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (
      password &&
      confirmPassword &&
      password.value !== confirmPassword.value
    ) {
      confirmPassword.setErrors({ passwordMismatch: true });
    } else if (confirmPassword?.hasError('passwordMismatch')) {
      confirmPassword.setErrors(null);
    }
    return null;
  }

  async onSignup() {
    if (this.signupForm.valid) {
      // Show terms and privacy modal before proceeding
      this.showTermsModal = true;
    } else {
      await this.showErrorAlert(
        'Please fill in all required fields correctly.'
      );
    }
  }

  async onTermsAgree() {
    this.showTermsModal = false;
    await this.proceedWithSignup();
  }

  onTermsDisagree() {
    this.showTermsModal = false;
    // User disagreed with terms, don't proceed with signup
  }

  async proceedWithSignup() {
    const { fullName, email, phone, password, role } = this.signupForm.value;

    const loading = await this.loadingController.create({
      message: 'Creating your account...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      this.isLoading = true;
      await this.authService.signup(email, password, fullName, phone, role);

      // Redirect based on role - all roles now handled consistently
      if (!this.hasRedirected) {
        this.hasRedirected = true;
        await this.redirectBasedOnRole(role);
      }
    } catch (error: any) {
      await this.showErrorAlert(this.getErrorMessage(error));
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/weak-password':
        return 'Password is too weak. Please choose a stronger password.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      default:
        return 'Account creation failed. Please try again.';
    }
  }

  private async showErrorAlert(message: string) {
    const alert = await this.alertController.create({
      header: 'Signup Error',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    console.log('SignupPage: Redirecting based on role:', role);

    switch (role) {
      case 'client':
        // For new client signups, always redirect to verification page
        this.router.navigate(['/pages/auth/client-verification'], {
          replaceUrl: true,
        });
        break;
      case 'worker':
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            // Import WorkerService dynamically to avoid circular dependency
            const { WorkerService } = await import(
              '../../../services/worker.service'
            );
            const workerService = new (WorkerService as any)(
              (this.authService as any).firestore
            );

            const hasCompleted = await workerService.hasCompletedInterview(
              user.uid
            );

            if (!hasCompleted) {
              this.router.navigate(['/pages/worker/interview'], {
                replaceUrl: true,
              });
            } else {
              this.router.navigate(['/pages/worker/dashboard'], {
                replaceUrl: true,
              });
            }
          } else {
            this.router.navigate(['/pages/worker/dashboard'], {
              replaceUrl: true,
            });
          }
        } catch (error) {
          console.error('SignupPage: Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard'], {
            replaceUrl: true,
          });
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard'], { replaceUrl: true });
        break;
    }
  }

  goToLogin() {
    this.router.navigate(['/pages/auth/login']);
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
