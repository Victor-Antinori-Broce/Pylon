"""
Middleware para redirección automática de usuarios con rol "Usuario" a capacitaciones_app
Autor: Sistema de Capacitaciones PACÍFICO
Fecha: Junio 22, 2025
"""

from django.shortcuts import redirect
from django.urls import reverse
from django.http import HttpResponseRedirect
import logging

logger = logging.getLogger(__name__)


class UserRoleRedirectMiddleware:
    """
    Middleware que intercepta las requests de usuarios y redirige según su rol en pacifico.
    
    LÓGICA DE ACCESO:
    - Staff users (is_staff=True): Acceso libre a TODO el sistema
    - Usuarios con rol "Usuario" en pacifico: SOLO acceso a capacitaciones (/cursos/)
    - Otros roles (Oficial, Asistente, Administrador, Supervisor, Analista, Back Office): Acceso libre a TODO
    
    FLUJO:
    1. Usuario con rol "Usuario" hace login
    2. Intenta acceder a cualquier URL fuera de /cursos/
    3. Middleware intercepta y redirige a /cursos/
    4. Usuario queda restringido solo a capacitaciones_app
    
    USUARIOS QUE NO SON REDIRIGIDOS:
    - Staff users
    - Oficial, Asistente, Administrador, Supervisor, Analista, Back Office
    - Usuarios sin UserProfile de pacifico
    """
    
    def __init__(self, get_response):
        """
        Inicialización del middleware
        """
        self.get_response = get_response
        # URLs que están permitidas para usuarios con rol "Usuario"
        self.allowed_paths = [
            '/cursos/',                    # App de capacitaciones
            '/perfil/',                    # Perfil de usuario
            '/mi-progreso/',               # Progreso del usuario
            '/validacion-ui/',             # Validación UI
            '/temas/',                     # Temas (completar, ver)
            '/capacitaciones/',            # Dashboard y asignaciones
            '/asignar-curso/',             # AJAX asignación
            '/cursos-asignados/',          # AJAX cursos asignados
            '/miembros-grupo/',            # AJAX miembros grupo
            '/usuarios-grupo/',            # AJAX usuarios grupo
            '/desasignar-curso/',          # AJAX desasignar
            '/usuarios-disponibles-grupo/', # Gestión grupos
            '/agregar-miembros-grupo/',    # Gestión grupos
            '/remover-miembro-grupo/',     # Gestión grupos
            '/exportar-asignaciones-excel/', # Exportar Excel
            '/encuesta/',                  # Encuestas de satisfacción
            '/api/',                       # API endpoints
            '/static/',                    # Archivos estáticos
            '/media/',                     # Archivos de media
        ]
        # URLs que NO deben ser interceptadas (evitar loops)
        self.exempt_paths = [
            '/admin/login/',      # Login del admin
            '/accounts/login/',   # Login
            '/login/',            # Login alternativo
            '/logout/',           # Logout
            '/accounts/logout/',  # Logout alternativo
            '/admin/logout/',     # Logout admin
        ]

    def __call__(self, request):
        """
        Procesa cada request que llega al sistema
        """
        # Procesar la request antes de pasarla a la view
        redirect_response = self.process_request(request)
        if redirect_response:
            return redirect_response
              # Si no hay redirección, continuar normalmente
        response = self.get_response(request)
        return response

    def process_request(self, request):
        """
        Intercepta las requests antes de que lleguen a las views.
        
        LÓGICA DE REDIRECCIÓN:
        1. Staff users: Acceso libre a todo
        2. Usuarios con rol "Usuario" en pacifico: Solo acceso a capacitaciones
        3. Otros roles (Oficial, Asistente, Administrador, Supervisor, Analista): Acceso libre
        """
        # Solo procesar usuarios autenticados
        if not request.user.is_authenticated:
            return None
            
        # Si el usuario es STAFF, permitir acceso libre a todo el sistema
        if request.user.is_staff:
            logger.info(f"Usuario staff '{request.user.username}' tiene acceso libre al sistema")
            return None
        
        # Verificar el rol en pacifico.UserProfile (prioridad)
        try:
            user_profile = request.user.userprofile
            pacifico_role = user_profile.rol
            
            # Roles que tienen acceso libre a todo el sistema
            roles_con_acceso_libre = [
                'Oficial', 
                'Asistente', 
                'Administrador', 
                'Supervisor', 
                'Analista',
                'Back Office'  # Incluido por seguridad
            ]
            
            # Si el usuario tiene un rol con acceso libre, no redirigir
            if pacifico_role in roles_con_acceso_libre:
                return None
            
            # Si el usuario tiene rol "Usuario", redirigir a capacitaciones
            if pacifico_role == 'Usuario':
                # Obtener la URL actual
                current_path = request.path
                
                # No interceptar URLs exentas (login, logout, etc.)
                for exempt_path in self.exempt_paths:
                    if current_path.startswith(exempt_path):
                        return None
                
                # Verificar si ya está en una URL permitida
                for allowed_path in self.allowed_paths:
                    if current_path.startswith(allowed_path):
                        return None
                
                # Redirigir a capacitaciones
                logger.info(f"Redirigiendo usuario '{request.user.username}' con rol 'Usuario' desde '{current_path}' hacia '/cursos/'")
                return HttpResponseRedirect('/cursos/')
            
            # Otros roles no definidos: permitir acceso
            return None
            
        except AttributeError:
            # Si no tiene UserProfile de pacifico, permitir acceso normal
            logger.info(f"Usuario '{request.user.username}' sin UserProfile de pacifico, permitiendo acceso libre")
            return None
