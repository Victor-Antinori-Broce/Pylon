"""
Script de prueba para verificar que los permisos de capacitaciones funcionan correctamente.
Este script verifica que los usuarios con rol 'Administrador' puedan acceder a todas las funcionalidades.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from pacifico.models import UserProfile
from capacitaciones_app.permissions import (
    es_administrador_capacitaciones,
    puede_asignar_cursos,
    puede_ver_reportes
)


class Command(BaseCommand):
    help = 'Prueba las funciones de permisos del sistema de capacitaciones'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('🧪 PROBANDO SISTEMA DE PERMISOS DE CAPACITACIONES'))
        self.stdout.write('=' * 60)
        
        # Obtener usuarios de prueba
        usuarios_test = [
            # Superusuarios
            *User.objects.filter(is_superuser=True)[:2],
            # Usuarios con rol Administrador
            *User.objects.filter(userprofile__rol='Administrador')[:3],
            # Usuarios con rol Supervisor  
            *User.objects.filter(userprofile__rol='Supervisor')[:2],
            # Usuarios con otros roles
            *User.objects.filter(userprofile__rol='Oficial')[:2],
            *User.objects.filter(userprofile__rol='Usuario')[:2],
        ]
        
        if not usuarios_test:
            self.stdout.write(self.style.WARNING('⚠️  No se encontraron usuarios para probar'))
            return
        
        # Headers de la tabla
        self.stdout.write(f'\n{"Usuario":<15} {"Rol":<12} {"Staff":<6} {"Super":<6} {"Admin":<6} {"Asignar":<8} {"Reportes":<9}')
        self.stdout.write('-' * 70)
        
        for user in usuarios_test:
            # Información básica del usuario
            username = user.username[:14]
            is_staff = '✅' if user.is_staff else '❌'
            is_super = '✅' if user.is_superuser else '❌'
            
            # Obtener rol del usuario
            try:
                rol = user.userprofile.rol[:11] if hasattr(user, 'userprofile') else 'Sin perfil'
            except:
                rol = 'Sin perfil'
            
            # Probar permisos
            try:
                admin_capacitaciones = '✅' if es_administrador_capacitaciones(user) else '❌'
                asignar_cursos = '✅' if puede_asignar_cursos(user) else '❌'
                ver_reportes = '✅' if puede_ver_reportes(user) else '❌'
            except Exception as e:
                admin_capacitaciones = f'❌({str(e)[:3]})'
                asignar_cursos = f'❌({str(e)[:3]})'
                ver_reportes = f'❌({str(e)[:3]})'
            
            # Mostrar resultados
            self.stdout.write(
                f'{username:<15} {rol:<12} {is_staff:<6} {is_super:<6} '
                f'{admin_capacitaciones:<6} {asignar_cursos:<8} {ver_reportes:<9}'
            )
        
        # Verificaciones específicas
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('🔍 VERIFICACIONES ESPECÍFICAS:'))
        
        # 1. Verificar usuarios administradores
        administradores = User.objects.filter(userprofile__rol='Administrador')
        self.stdout.write(f'\n1️⃣  USUARIOS CON ROL ADMINISTRADOR:')
        
        for admin in administradores:
            puede_admin = es_administrador_capacitaciones(admin)
            puede_asignar = puede_asignar_cursos(admin)
            puede_reportes = puede_ver_reportes(admin)
            
            status = '✅ COMPLETO' if (puede_admin and puede_asignar and puede_reportes) else '❌ INCOMPLETO'
            
            self.stdout.write(
                f'   • {admin.username}: {status}'
                f' (Admin: {puede_admin}, Asignar: {puede_asignar}, Reportes: {puede_reportes})'
            )
        
        # 2. Verificar supervisores
        supervisores = User.objects.filter(userprofile__rol='Supervisor')
        if supervisores.exists():
            self.stdout.write(f'\n2️⃣  USUARIOS CON ROL SUPERVISOR:')
            
            for supervisor in supervisores:
                puede_admin = es_administrador_capacitaciones(supervisor)
                puede_asignar = puede_asignar_cursos(supervisor)
                puede_reportes = puede_ver_reportes(supervisor)
                
                # Los supervisores NO deben tener permisos de admin completo
                status = '✅ CORRECTO' if (not puede_admin and puede_asignar and puede_reportes) else '❌ INCORRECTO'
                
                self.stdout.write(
                    f'   • {supervisor.username}: {status}'
                    f' (Admin: {puede_admin}, Asignar: {puede_asignar}, Reportes: {puede_reportes})'
                )
        
        # 3. Verificar usuarios normales
        usuarios_normales = User.objects.filter(userprofile__rol__in=['Usuario', 'Oficial'])[:3]
        if usuarios_normales.exists():
            self.stdout.write(f'\n3️⃣  USUARIOS NORMALES:')
            
            for usuario in usuarios_normales:
                puede_admin = es_administrador_capacitaciones(usuario)
                puede_asignar = puede_asignar_cursos(usuario)
                puede_reportes = puede_ver_reportes(usuario)
                
                # Los usuarios normales NO deben tener permisos administrativos
                status = '✅ CORRECTO' if (not puede_admin and not puede_asignar and not puede_reportes) else '❌ INCORRECTO'
                
                rol = usuario.userprofile.rol if hasattr(usuario, 'userprofile') else 'Sin perfil'
                self.stdout.write(
                    f'   • {usuario.username} ({rol}): {status}'
                    f' (Admin: {puede_admin}, Asignar: {puede_asignar}, Reportes: {puede_reportes})'
                )
        
        # Resumen final
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('📋 RESUMEN:'))
        
        total_administradores = User.objects.filter(userprofile__rol='Administrador').count()
        admin_con_permisos = sum(1 for admin in User.objects.filter(userprofile__rol='Administrador') 
                                if es_administrador_capacitaciones(admin))
        
        self.stdout.write(f'   • Administradores totales: {total_administradores}')
        self.stdout.write(f'   • Administradores con permisos completos: {admin_con_permisos}')
        
        if admin_con_permisos == total_administradores and total_administradores > 0:
            self.stdout.write(self.style.SUCCESS('\n🎉 ¡TODOS LOS ADMINISTRADORES PUEDEN ASIGNAR CURSOS!'))
        elif total_administradores == 0:
            self.stdout.write(self.style.WARNING('\n⚠️  No hay usuarios con rol Administrador'))
        else:
            self.stdout.write(self.style.ERROR(f'\n❌ {total_administradores - admin_con_permisos} administradores SIN permisos'))
        
        self.stdout.write('\n' + '=' * 60)