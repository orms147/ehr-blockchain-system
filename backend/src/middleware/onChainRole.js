import { getUserRoleStrict } from '../config/blockchain.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OnChainRole');

const ROLE_CHECKS = {
    patient: (flags) => flags?.isPatient === true,
    doctor: (flags) => flags?.isDoctor === true || flags?.isVerifiedDoctor === true,
    verifiedDoctor: (flags) => flags?.isVerifiedDoctor === true,
    org: (flags) => flags?.isOrg === true || flags?.isVerifiedOrg === true || flags?.isActiveOrgAdmin === true,
    orgAdmin: (flags) => flags?.isActiveOrgAdmin === true,
    ministry: (flags) => flags?.isMinistry === true,
};

function normalizeRequiredRoles(requiredRoles = []) {
    const roles = [];

    for (const role of requiredRoles.flat()) {
        if (!role || typeof role !== 'string') continue;

        const normalized = role.trim();
        if (!normalized || !ROLE_CHECKS[normalized]) continue;
        if (!roles.includes(normalized)) {
            roles.push(normalized);
        }
    }

    return roles;
}

function hasRequiredRole(flags, requiredRoles) {
    return requiredRoles.some((role) => {
        const checker = ROLE_CHECKS[role];
        return checker ? checker(flags) : false;
    });
}

async function resolveOnChainRoles(req) {
    if (req?.onChainRoles) {
        return req.onChainRoles;
    }

    const walletAddress = req?.user?.walletAddress?.toLowerCase();
    if (!walletAddress) {
        throw new Error('Missing wallet address in authenticated user context.');
    }

    const roleFlags = await getUserRoleStrict(walletAddress);
    req.onChainRoles = roleFlags;
    req.user = {
        ...req.user,
        ...roleFlags,
        walletAddress,
    };

    return roleFlags;
}

function roleUnavailable(res, error) {
    log.error('Unable to load on-chain role flags', { error: error.message });
    return res.status(503).json({
        error: 'Khong the xac minh role on-chain luc nay. Vui long thu lai.',
        code: 'ONCHAIN_ROLE_UNAVAILABLE',
    });
}

export async function attachOnChainRoles(req, res, next) {
    try {
        await resolveOnChainRoles(req);
        next();
    } catch (error) {
        roleUnavailable(res, error);
    }
}

export function requireOnChainRoles(...requiredRoles) {
    const normalizedRoles = normalizeRequiredRoles(requiredRoles);

    return async (req, res, next) => {
        if (!req?.user?.walletAddress) {
            return res.status(401).json({ error: 'No authenticated user context' });
        }

        if (normalizedRoles.length === 0) {
            return next();
        }

        try {
            const roleFlags = await resolveOnChainRoles(req);

            if (!hasRequiredRole(roleFlags, normalizedRoles)) {
                return res.status(403).json({
                    error: 'Insufficient on-chain role permissions',
                    code: 'ONCHAIN_ROLE_FORBIDDEN',
                    requiredRoles: normalizedRoles,
                    onChainRoles: {
                        isPatient: roleFlags.isPatient,
                        isDoctor: roleFlags.isDoctor,
                        isVerifiedDoctor: roleFlags.isVerifiedDoctor,
                        isMinistry: roleFlags.isMinistry,
                        isOrg: roleFlags.isOrg,
                        isVerifiedOrg: roleFlags.isVerifiedOrg,
                        isActiveOrgAdmin: roleFlags.isActiveOrgAdmin,
                    },
                });
            }

            next();
        } catch (error) {
            roleUnavailable(res, error);
        }
    };
}
