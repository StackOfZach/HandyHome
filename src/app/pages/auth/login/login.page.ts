import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { LoadingController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isLoading = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
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

  async onLogin() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;

      const loading = await this.loadingController.create({
        message: 'Logging in...',
        spinner: 'crescent',
      });
      await loading.present();

      try {
        this.isLoading = true;
        await this.authService.login(email, password);
        // Navigation is handled by AuthService
      } catch (error: any) {
        await this.showErrorAlert(this.getErrorMessage(error));
      } finally {
        this.isLoading = false;
        await loading.dismiss();
      }
    } else {
      await this.showErrorAlert(
        'Please fill in all required fields correctly.'
      );
    }
  }

  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return 'Login failed. Please try again.';
    }
  }

  private async showErrorAlert(message: string) {
    const alert = await this.alertController.create({
      header: 'Login Error',
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

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }
}
