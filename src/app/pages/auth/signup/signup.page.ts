import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { LoadingController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: false,
})
export class SignupPage implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  showTermsModal = false;

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
          [Validators.required, Validators.pattern(/^[0-9]{11}$/), Validators.minLength(11), Validators.maxLength(11)],
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['client', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  ngOnInit() {
    // Check if user is already logged in
    if (this.authService.isAuthenticated()) {
      const profile = this.authService.getCurrentUserProfile();
      if (profile) {
        this.redirectBasedOnRole(profile.role);
      }
    }
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

      // Handle redirect based on role
      if (role === 'client') {
        // For clients, redirect to verification page
        this.router.navigate(['/pages/auth/client-verification']);
      } else {
        // For workers and admins, use the original redirect logic
        this.redirectBasedOnRole(role);
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

  private redirectBasedOnRole(role: 'client' | 'worker' | 'admin') {
    switch (role) {
      case 'client':
        this.router.navigate(['/pages/client/dashboard']);
        break;
      case 'worker':
        this.router.navigate(['/pages/worker/dashboard']);
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard']);
        break;
    }
  }

  goToLogin() {
    this.router.navigate(['/pages/auth/login']);
  }
}
