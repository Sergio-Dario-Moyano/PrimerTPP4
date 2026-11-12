import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import {
  clavesCoincidenValidator, soloLetrasValidator, tipoSangreValidator, enteroValidator,
  fechaNacimientoValidator, TIPOS_SANGRE
} from '../../../shared/validators/auth';
import { AbstractControl } from '@angular/forms';
import { mensajeDeError } from '../../../shared/utils/mensajes-error';

import { SupabaseService } from '../../../core/services/supabase';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.component.css',
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private modalService = inject(ModalService);
  private route = inject(ActivatedRoute);
  private supabaseService = inject(SupabaseService);

  readonly tiposSangre = TIPOS_SANGRE;

  isLoginMode = signal<boolean>(true);
  cargando = signal<boolean>(false);

  loginForm = new FormGroup({
    email: new FormControl('', { validators: [Validators.required, Validators.email], nonNullable: true }),
    clave: new FormControl('', { validators: [Validators.required, Validators.minLength(6)], nonNullable: true }),
  });

  controlClaveRegistro = new FormControl('', {
    validators: [Validators.required, Validators.minLength(6)],
    nonNullable: true,
  });

  registroForm = new FormGroup({
    email: new FormControl('', { validators: [Validators.required, Validators.email], nonNullable: true }),
    nombre: new FormControl('', { validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50), soloLetrasValidator], nonNullable: true }),
    apellido: new FormControl('', { validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50), soloLetrasValidator], nonNullable: true }),
    fechaNacimiento: new FormControl('', { validators: [Validators.required, fechaNacimientoValidator], nonNullable: true }),
    tipoSangre: new FormControl('', { validators: [Validators.required, tipoSangreValidator], nonNullable: true }),
    colorOjos: new FormControl('', { validators: [Validators.required, Validators.minLength(3), Validators.maxLength(30), soloLetrasValidator], nonNullable: true }),
    // Empieza vacío; tiene que ser un entero entre 1 y 365 (ni cero ni negativo)
    diasVacaciones: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(365), enteroValidator] }),
    clave: this.controlClaveRegistro,
    confirmarClave: new FormControl('', {
      validators: [Validators.required, clavesCoincidenValidator(this.controlClaveRegistro)],
      nonNullable: true,
    }),
  });

  /** Devuelve el mensaje de error del campo, solo si el usuario ya lo tocó. */
  mensajeError(control: AbstractControl): string | null {
    if (!(control.touched || control.dirty)) return null;
    return mensajeDeError(control.errors);
  }

  constructor() {
    // Si cambia la contraseña, volvemos a comparar con la confirmación
    this.controlClaveRegistro.valueChanges.subscribe(() =>
      this.registroForm.controls.confirmarClave.updateValueAndValidity({ emitEvent: false }));
  }

  toggleMode() {
    this.isLoginMode.update(mode => !mode);
    this.loginForm.reset();
    this.registroForm.reset();
  }

  formatearFecha(event: Event) {
    const input = event.target as HTMLInputElement;
    let valor = input.value.replace(/\D/g, '');
    let nuevoValor = '';

    if (valor.length === 0) {
      nuevoValor = '';
    } else if (valor.length <= 2) {
      nuevoValor = valor;
    } else if (valor.length <= 4) {
      nuevoValor = `${valor.slice(0, 2)} / ${valor.slice(2)}`;
    } else {
      nuevoValor = `${valor.slice(0, 2)} / ${valor.slice(2, 4)} / ${valor.slice(4, 8)}`;
    }

    input.value = nuevoValor;
    this.registroForm.controls.fechaNacimiento.setValue(nuevoValor);
    this.registroForm.controls.fechaNacimiento.markAsDirty();
  }

  async onLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    const emailIngresado = this.loginForm.controls.email.value;

    try {
      await this.authService.iniciarSesion(
        emailIngresado,
        this.loginForm.controls.clave.value
      );

      console.log('Login exitoso');
      this.router.navigate(['/']);

    } catch (err: any) {
      console.error('Detalle técnico del error:', err);

      // CAPTURAMOS SI EL USUARIO NO EXISTE O CREDENCIALES SON INVÁLIDAS
      // Abrimos el servicio de modales y cambiamos al formulario de registro
      const mensajeError = err?.message || '';
      if (mensajeError.includes('Invalid login credentials') || mensajeError.includes('Invalid') || mensajeError.includes('not found')) {

        this.modalService.open(
          'Cuenta No Encontrada',
          'No encontramos una cuenta registrada con este correo o la contraseña es incorrecta. Te redirigiremos al registro.',
          'error'
        );

        // Cambiamos automáticamente al formulario de registro
        this.isLoginMode.set(false);

        // Autocompletamos el correo en el formulario de registro para mayor comodidad
        this.registroForm.patchValue({ email: emailIngresado });
        this.loginForm.reset();
        return;
      }

      // Si es otro tipo de error general de login
      this.modalService.open('Error de Acceso', 'Ocurrió un problema al iniciar sesión. Verifica tus datos.', 'error');

    } finally {
      this.cargando.set(false);
    }
  }

  async onRegistro() {
    if (this.registroForm.invalid) {
      this.registroForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    const formValues = this.registroForm.getRawValue();

    const partesFecha = formValues.fechaNacimiento.split(' / ');
    const fechaParaBD = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}`;

    try {
      const nuevoUsuario = await this.authService.registrarUsuario(
        formValues.email,
        formValues.clave,
        {
          nombre: formValues.nombre.trim(),
          apellido: formValues.apellido.trim(),
          fecha_nacimiento: fechaParaBD,
          tipo_sangre: formValues.tipoSangre.toUpperCase(),
          color_ojos: formValues.colorOjos.trim(),
          dias_vacaciones: Number(formValues.diasVacaciones)
        }
      );

      const ticketIdPendiente = this.route.snapshot.queryParamMap.get('vincular_ticket');

      if (ticketIdPendiente && nuevoUsuario?.user?.id) {
        const supabase = this.supabaseService.client;

        const { data: compraPendiente } = await supabase
          .from('compras')
          .select('total_pagado')
          .eq('id', ticketIdPendiente)
          .single();

        await supabase
          .from('compras')
          .update({ perfil_id: nuevoUsuario.user.id })
          .eq('id', ticketIdPendiente);

        if (compraPendiente) {
          await supabase
            .from('perfiles')
            .update({ puntos_fidelizacion: compraPendiente.total_pagado })
            .eq('id', nuevoUsuario.user.id);
        }
      }

      this.registroForm.reset();
      this.modalService.open(
        '¡Registro exitoso!',
        `Tu cuenta fue creada correctamente. ¡Bienvenido/a, ${formValues.nombre.trim()}!`,
        'success'
      );
      this.router.navigate(['/']);

    } catch (err: any) {
      console.error('Detalle técnico del error:', err);
      const yaRegistrado = err?.message === 'EMAIL_YA_REGISTRADO' || /already registered/i.test(err?.message ?? '');
      this.modalService.open(
        'Error en el Registro',
        yaRegistrado
          ? 'Ya existe una cuenta con ese correo. Iniciá sesión o usá otro correo.'
          : 'No se pudo completar el registro. Intenta con otro correo.',
        'error'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
