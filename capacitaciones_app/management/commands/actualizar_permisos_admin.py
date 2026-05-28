"""
Script para actualizar los permisos de usuarios administradores en el sistema de capacitaciones.

Este script asegura que todos los usuarios con rol 'Administrador' tengan también
el flag is_staff=True para que puedan acceder a todas las funcionalidades administrativas.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from pacifico.models import UserProfile


class Command(BaseCommand):
    help = 'Actualiza permisos para usuarios administradores del sistema de capacitaciones'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Iniciando actualización de permisos...'))
        
        # Buscar usuarios con rol de Administrador
        administradores = UserProfile.objects.filter(rol='Administrador')
        
        updated_count = 0
        for profile in administradores:
            user = profile.user
            if not user.is_staff:
                user.is_staff = True
                user.save()
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✅ Usuario {user.username} ({user.get_full_name()}) '
                        f'actualizado con permisos de staff'
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f'⚠️  Usuario {user.username} ya tenía permisos de staff'
                    )
                )
        
        # Mostrar resumen
        total_administradores = administradores.count()
        self.stdout.write(
            self.style.SUCCESS(
                f'\n📊 RESUMEN:'
                f'\n   • Total usuarios con rol Administrador: {total_administradores}'
                f'\n   • Usuarios actualizados: {updated_count}'
                f'\n   • Usuarios ya configurados: {total_administradores - updated_count}'
            )
        )
        
        # Verificar que el sistema esté funcionando correctamente
        self.stdout.write(
            self.style.SUCCESS(
                f'\n🔍 VERIFICACIÓN:'
            )
        )
        
        for profile in administradores:
            user = profile.user
            permisos_ok = user.is_staff
            status_icon = '✅' if permisos_ok else '❌'
            
            self.stdout.write(
                f'   {status_icon} {user.username} - '
                f'Staff: {user.is_staff} - '
                f'Rol: {profile.rol}'
            )
        
        if updated_count > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n🎉 Actualización completada exitosamente!'
                    f'\nLos usuarios administradores ahora pueden:'
                    f'\n   • Asignar cursos a usuarios y grupos'
                    f'\n   • Ver reportes y exportar datos'
                    f'\n   • Administrar completamente la app de capacitaciones'
                    f'\n   • Acceder al dashboard administrativo'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    '\n✅ Todos los usuarios administradores ya tenían los permisos correctos.'
                )
            )