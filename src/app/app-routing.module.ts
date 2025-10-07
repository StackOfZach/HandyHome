import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/pages/auth/login',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadChildren: () =>
      import('./home/home.module').then((m) => m.HomePageModule),
  },
  // Authentication Routes
  {
    path: 'pages/auth/login',
    loadChildren: () =>
      import('./pages/auth/login/login.module').then((m) => m.LoginPageModule),
  },
  {
    path: 'pages/auth/signup',
    loadChildren: () =>
      import('./pages/auth/signup/signup.module').then(
        (m) => m.SignupPageModule
      ),
  },
  // Client Dashboard - Protected Route
  {
    path: 'pages/client/dashboard',
    loadChildren: () =>
      import('./pages/client/dashboard/dashboard.module').then(
        (m) => m.ClientDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Worker Interview - Protected Route
  {
    path: 'pages/worker/interview',
    loadChildren: () =>
      import('./pages/worker/interview/interview.module').then(
        (m) => m.InterviewPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Dashboard - Protected Route
  {
    path: 'pages/worker/dashboard',
    loadChildren: () =>
      import('./pages/worker/dashboard/dashboard.module').then(
        (m) => m.WorkerDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Job Listings - Protected Route
  {
    path: 'pages/worker/job-listings',
    loadChildren: () =>
      import('./pages/worker/job-listings/job-listings.module').then(
        (m) => m.JobListingsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Job History - Protected Route
  {
    path: 'pages/worker/job-history',
    loadChildren: () =>
      import('./pages/worker/job-history/job-history.module').then(
        (m) => m.JobHistoryPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Admin Dashboard - Protected Route
  {
    path: 'pages/admin/dashboard',
    loadChildren: () =>
      import('./pages/admin/dashboard/dashboard.module').then(
        (m) => m.AdminDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'admin' },
  },
  // Book Service - Protected Route
  {
    path: 'pages/book-service',
    loadChildren: () =>
      import('./pages/book-service/book-service.module').then(
        (m) => m.BookServicePageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // My Bookings - Protected Route
  {
    path: 'pages/my-bookings',
    loadChildren: () =>
      import('./pages/my-bookings/my-bookings.module').then(
        (m) => m.MyBookingsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Quick Booking Flow - Protected Routes
  {
    path: 'client/select-category',
    loadChildren: () =>
      import('./pages/client/select-category/select-category.module').then(
        (m) => m.SelectCategoryPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/select-location/:categoryId',
    loadChildren: () =>
      import('./pages/client/select-location/select-location.module').then(
        (m) => m.SelectLocationPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/confirm-booking',
    loadChildren: () =>
      import('./pages/client/confirm-booking/confirm-booking.module').then(
        (m) => m.ConfirmBookingPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/searching/:bookingId',
    loadChildren: () =>
      import('./pages/client/searching/searching.module').then(
        (m) => m.SearchingPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/worker-found/:bookingId',
    loadChildren: () =>
      import('./pages/client/worker-found/worker-found.module').then(
        (m) => m.WorkerFoundPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Profile - Protected Route
  {
    path: 'pages/profile',
    loadChildren: () =>
      import('./pages/profile/profile.module').then((m) => m.ProfilePageModule),
    canActivate: [AuthGuard],
  },
  // Quick Bookings History - Protected Route
  {
    path: 'pages/quick-bookings-history',
    loadChildren: () =>
      import(
        './pages/quick-bookings-history/quick-bookings-history.module'
      ).then((m) => m.QuickBookingsHistoryPageModule),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Quick Booking Details - Protected Route
  {
    path: 'pages/quick-booking-details/:id',
    loadChildren: () =>
      import('./pages/quick-booking-details/quick-booking-details.module').then(
        (m) => m.QuickBookingDetailsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Wildcard route - redirect to login
  {
    path: '**',
    redirectTo: '/pages/auth/login',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
