import { Routes } from '@angular/router';
import { signedInGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent) },
  { path: '', canActivate: [signedInGuard], loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent) },
  { path: 'new', canActivate: [signedInGuard], loadComponent: () => import('./pages/new-booking.component').then((m) => m.NewBookingComponent) },
  { path: 'holds', canActivate: [signedInGuard], loadComponent: () => import('./pages/holds.component').then((m) => m.HoldsComponent) },
  { path: 'bookings', canActivate: [signedInGuard], loadComponent: () => import('./pages/bookings.component').then((m) => m.BookingsComponent) },
  { path: 'account', canActivate: [signedInGuard], loadComponent: () => import('./pages/account.component').then((m) => m.AccountComponent) },
  // The built-in user guide (Dave, 2026-09-06: "write a full set of user documentation for the STO site and include it in the build with a link on the command bar").
  { path: 'help', canActivate: [signedInGuard], loadComponent: () => import('./pages/help.component').then((m) => m.HelpComponent) },
  { path: '**', redirectTo: '' },
];
