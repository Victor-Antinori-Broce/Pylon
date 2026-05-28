"""
Management command para sincronizar roles desde pacifico.UserProfile a capacitaciones.PerfilUsuario
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from capacitaciones_app.models import PerfilUsuario


class Command(BaseCommand):
    help = 'Sincroniza roles desde pacifico.UserProfile a capacitaciones.PerfilUsuario'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Muestra los cambios sin aplicarlos',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Sobrescribe roles existentes incluso si ya están configurados',
        )
        parser.add_argument(
            '--create-missing',
            action='store_true',
            help='Crea PerfilUsuario para usuarios que no lo tienen',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']
        create_missing = options['create_missing']
        
        self.stdout.write(self.style.SUCCESS('=== Sincronización de Roles de Capacitaciones ===\n'))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('Modo DRY-RUN: No se aplicarán cambios\n'))
        
        # Mapeo de roles
        role_mapping = {
            'Administrador': 'administrador',
            'Supervisor': 'supervisor',
            'Oficial': 'estudiante',
            'Asistente': 'estudiante',
            'Analista': 'estudiante',
            'Back Office': 'estudiante',
            'Usuario': 'estudiante',
        }
        
        # Intentar importar UserProfile de pacifico
        try:
            from pacifico.models import UserProfile
            has_pacifico = True
        except ImportError:
            has_pacifico = False
            self.stdout.write(self.style.WARNING('No se encontró pacifico.UserProfile\n'))
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_count = 0
        
        # Procesar todos los usuarios activos
        usuarios = User.objects.filter(is_active=True).order_by('username')
        total_usuarios = usuarios.count()
        
        self.stdout.write(f'Procesando {total_usuarios} usuarios...\n')
        
        for user in usuarios:
            try:
                # Obtener o crear PerfilUsuario
                perfil, created = PerfilUsuario.objects.get_or_create(
                    user=user,
                    defaults={
                        'rol_capacitaciones': 'estudiante',
                        'activo': True,
                        'fecha_asignacion_rol': timezone.now(),
                    }
                )
                
                if created:
                    if not dry_run:
                        created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  ✓ Creado perfil para {user.username}')
                    )
                
                # Determinar el nuevo rol
                nuevo_rol = None
                origen = None
                
                # Superusuarios siempre son administradores
                if user.is_superuser:
                    nuevo_rol = 'administrador'
                    origen = 'superusuario'
                
                # Si tiene UserProfile de pacifico, mapear el rol
                elif has_pacifico:
                    try:
                        user_profile = UserProfile.objects.get(user=user)
                        pacifico_rol = user_profile.rol
                        nuevo_rol = role_mapping.get(pacifico_rol, 'estudiante')
                        origen = f'pacifico ({pacifico_rol})'
                    except UserProfile.DoesNotExist:
                        if create_missing or created:
                            nuevo_rol = 'estudiante'
                            origen = 'default'
                
                # Actualizar si es necesario
                if nuevo_rol and (force or perfil.rol_capacitaciones != nuevo_rol):
                    if not dry_run:
                        perfil.rol_capacitaciones = nuevo_rol
                        perfil.fecha_asignacion_rol = timezone.now()
                        perfil.notas = f"Sincronizado desde {origen} - {timezone.now().strftime('%Y-%m-%d %H:%M')}"
                        perfil.save()
                        updated_count += 1
                    
                    self.stdout.write(
                        self.style.WARNING(
                            f'  → {user.username}: {perfil.rol_capacitaciones} → {nuevo_rol} (origen: {origen})'
                        )
                    )
                else:
                    skipped_count += 1
                    if options['verbosity'] >= 2:
                        self.stdout.write(
                            f'  - {user.username}: {perfil.rol_capacitaciones} (sin cambios)'
                        )
                
            except Exception as e:
                error_count += 1
                self.stdout.write(
                    self.style.ERROR(f'  ✗ Error procesando {user.username}: {str(e)}')
                )
        
        # Resumen
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('Resumen:'))
        self.stdout.write(f'  Total procesados: {total_usuarios}')
        self.stdout.write(f'  Perfiles creados: {created_count}')
        self.stdout.write(f'  Perfiles actualizados: {updated_count}')
        self.stdout.write(f'  Sin cambios: {skipped_count}')
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f'  Errores: {error_count}'))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nModo DRY-RUN: Ningún cambio fue aplicado'))
        else:
            self.stdout.write(self.style.SUCCESS('\nSincronización completada'))

