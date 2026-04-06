const ROLE_PRIORITY = ['ministry', 'org', 'doctor', 'patient'];

function normalizeRole(role) {
    if (!role || typeof role !== 'string') {
        return null;
    }

    const value = role.trim().toLowerCase();

    if (value === 'organization') {
        return 'org';
    }

    if (value === 'admin') {
        return 'ministry';
    }

    return ROLE_PRIORITY.includes(value) ? value : null;
}

function addRole(roleSet, role) {
    const normalized = normalizeRole(role);
    if (normalized) {
        roleSet.add(normalized);
    }
}

export function deriveRolesFromUser(user) {
    const roleSet = new Set();

    if (Array.isArray(user?.roles)) {
        user.roles.forEach((role) => addRole(roleSet, role));
    }

    if (user?.isPatient) {
        roleSet.add('patient');
    }
    if (user?.isDoctor || user?.isVerifiedDoctor) {
        roleSet.add('doctor');
    }
    if (user?.isOrg || user?.isVerifiedOrg || user?.isActiveOrgAdmin) {
        roleSet.add('org');
    }
    if (user?.isMinistry) {
        roleSet.add('ministry');
    }

    return ROLE_PRIORITY.filter((role) => roleSet.has(role));
}

export function resolveActiveRole(availableRoles, preferredRole) {
    const normalizedPreferred = normalizeRole(preferredRole);
    if (normalizedPreferred && availableRoles.includes(normalizedPreferred)) {
        return normalizedPreferred;
    }

    return availableRoles[0] || 'patient';
}

export function sanitizeRoles(inputRoles, fallbackUser) {
    const roleSet = new Set();

    if (Array.isArray(inputRoles)) {
        inputRoles.forEach((role) => addRole(roleSet, role));
    }

    const normalizedRoles = ROLE_PRIORITY.filter((role) => roleSet.has(role));

    if (normalizedRoles.length > 0) {
        return normalizedRoles;
    }

    return deriveRolesFromUser(fallbackUser);
}