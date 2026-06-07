import type { AuthSession, CharacterRow, UserProfile } from './types';
import type { Gender, VocationId } from '../../shared/types/character';
import { createDefaultCharacterConfig } from '../character/characterSerializer';
import { MAX_CHARACTERS_PER_ACCOUNT } from './types';
import { DEFAULT_GAME_CONFIG } from '../game-data/default/game.config';
import { resolveApiUrl } from './apiUrl';
import {
    createMockPasswordSalt,
    hashMockPassword,
    verifyMockPassword,
} from './mockPassword';

/**
 * Persistência mock (localStorage) em dev:
 * - game2d_mock_accounts   → e-mail, userId, hash da senha (PBKDF2)
 * - game2d_mock_session      → sessão ativa { userId, email }
 * - game2d_mock_profile      → perfil da sessão (role, studio)
 * - game2d_mock_characters   → personagens (posição, mapa, outfit, etc.)
 */
const SESSION_KEY = 'game2d_mock_session';
const PROFILE_KEY = 'game2d_mock_profile';
const CHARS_KEY = 'game2d_mock_characters';
const ACCOUNTS_KEY = 'game2d_mock_accounts';

interface MockAccountRecord {
    userId: string;
    email: string;
    passwordHash: string;
    salt: string;
    createdAt: string;
}

function uid(): string {
    return `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function userIdFromEmail(email: string): string {
    const cleanEmail = normalizeEmail(email).replace(/[^a-zA-Z0-9]/g, '_');
    return `mock_user_${cleanEmail}`;
}

export function isMockAuthEnabled(): boolean {
    if (import.meta.env.VITE_AUTH_MOCK === 'false') return false;
    if (import.meta.env.VITE_AUTH_MOCK === 'true') return true;
    if (import.meta.env.PROD) return false;
    return import.meta.env.VITE_USE_API_AUTH !== 'true';
}

function readAccounts(): Record<string, MockAccountRecord> {
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        return raw ? (JSON.parse(raw) as Record<string, MockAccountRecord>) : {};
    } catch {
        return {};
    }
}

function writeAccounts(accounts: Record<string, MockAccountRecord>): void {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function registerMockAccount(email: string, password: string): Promise<MockAccountRecord> {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();
    if (accounts[normalizedEmail]) {
        throw new Error('E-mail já cadastrado.');
    }
    const salt = createMockPasswordSalt();
    const passwordHash = await hashMockPassword(password, salt);
    const record: MockAccountRecord = {
        userId: userIdFromEmail(normalizedEmail),
        email: normalizedEmail,
        passwordHash,
        salt,
        createdAt: new Date().toISOString(),
    };
    accounts[normalizedEmail] = record;
    writeAccounts(accounts);
    return record;
}

async function resolveMockAccount(email: string, password: string): Promise<MockAccountRecord> {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();
    const existing = accounts[normalizedEmail];
    if (existing) {
        const valid = await verifyMockPassword(password, existing.salt, existing.passwordHash);
        if (!valid) {
            throw new Error('E-mail ou senha incorretos.');
        }
        return existing;
    }

    // Conta legada (antes do hash de senha): registra credencial na primeira entrada.
    const salt = createMockPasswordSalt();
    const passwordHash = await hashMockPassword(password, salt);
    const record: MockAccountRecord = {
        userId: userIdFromEmail(normalizedEmail),
        email: normalizedEmail,
        passwordHash,
        salt,
        createdAt: new Date().toISOString(),
    };
    accounts[normalizedEmail] = record;
    writeAccounts(accounts);
    return record;
}

function buildProfile(userId: string, email: string): UserProfile {
    const studio = email.endsWith('@gm.dev') || import.meta.env.VITE_MOCK_STUDIO === 'true';
    return {
        id: userId,
        displayName: email.split('@')[0],
        role: studio ? 'gm' : 'player',
        canAccessStudio: studio,
    };
}

function persistSession(account: MockAccountRecord): AuthSession {
    const session: AuthSession = { userId: account.userId, email: account.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(buildProfile(account.userId, account.email)));
    return session;
}

function readChars(): CharacterRow[] {
    try {
        const raw = localStorage.getItem(CHARS_KEY);
        let parsed = raw ? (JSON.parse(raw) as CharacterRow[]) : [];

        const sessionRaw = localStorage.getItem(SESSION_KEY);
        if (sessionRaw) {
            try {
                const session = JSON.parse(sessionRaw) as AuthSession;
                if (session?.userId) {
                    let migrated = false;
                    parsed = parsed.map((c) => {
                        if (
                            c.accountId &&
                            c.accountId.startsWith('mock_') &&
                            !c.accountId.startsWith('mock_user_')
                        ) {
                            c.accountId = session.userId;
                            migrated = true;
                        }
                        return c;
                    });
                    if (migrated) {
                        localStorage.setItem(CHARS_KEY, JSON.stringify(parsed));
                    }
                }
            } catch {
                /* ignore */
            }
        }

        return parsed.map((c) => {
            const config = (c.outfitConfig as any) || {};
            const vocation = c.vocation ?? (config.vocation as string) ?? 'knight';
            const gender = c.gender ?? (config.gender as Gender) ?? 'male';
            const spriteSheetUrl =
                c.outfitConfig?.spriteSheetUrl ||
                `tiles/characters/vocations/${gender}/${vocation}.png`;
            return {
                ...c,
                vocation,
                level: c.level ?? (config.level as number) ?? 1,
                experience: c.experience ?? (config.experience as number) ?? 0,
                gender,
                appearance: c.appearance ??
                    (config.appearance as CharacterRow['appearance']) ?? {
                        gender: gender as 'male' | 'female',
                        outfitId:
                            (config.appearance as { outfitId?: string } | undefined)?.outfitId ||
                            `default_${vocation}_${gender}`,
                        spriteSheetUrl,
                    },
                gameId: c.gameId ?? (config.gameId as string) ?? DEFAULT_GAME_CONFIG.id,
                mapId:
                    c.mapId ||
                    (config.mapId as string) ||
                    c.spawnMapId ||
                    DEFAULT_GAME_CONFIG.start.mapId,
                position:
                    c.position ??
                    (config.position as CharacterRow['position']) ??
                    { ...DEFAULT_GAME_CONFIG.start.position },
                direction:
                    c.direction ??
                    (config.direction as CharacterRow['direction']) ??
                    DEFAULT_GAME_CONFIG.start.direction,
            };
        });
    } catch (err) {
        console.error('Erro ao ler personagens do mockAuth:', err);
        return [];
    }
}

function writeChars(chars: CharacterRow[]): void {
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
}

export function mockGetSession(): AuthSession | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
        return null;
    }
}

export function mockGetProfile(): UserProfile | null {
    const session = mockGetSession();
    if (!session) return null;
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (raw) return JSON.parse(raw) as UserProfile;
    } catch {
        /* ignore */
    }
    return buildProfile(session.userId, session.email);
}

export async function mockSignUp(email: string, password: string): Promise<AuthSession> {
    const account = await registerMockAccount(email, password);
    return persistSession(account);
}

export async function mockSignIn(email: string, password: string): Promise<AuthSession> {
    const account = await resolveMockAccount(email, password);
    return persistSession(account);
}

export function mockSignOut(): void {
    localStorage.removeItem(SESSION_KEY);
}

export function mockListCharacters(accountId: string): CharacterRow[] {
    return readChars().filter((c) => c.accountId === accountId && !c.deletedAt);
}

export function mockGetCharacter(id: string, accountId: string): CharacterRow | null {
    return mockListCharacters(accountId).find((c) => c.id === id) ?? null;
}

export async function mockCreateCharacter(
    accountId: string,
    name: string,
    vocationId: VocationId,
    gender: Gender,
    outfitId: string,
    spriteSheetUrl: string,
    spawnMapId: string
): Promise<CharacterRow> {
    const chars = readChars();
    const active = chars.filter((c) => c.accountId === accountId && !c.deletedAt);
    if (active.length >= MAX_CHARACTERS_PER_ACCOUNT) {
        throw new Error(`Limite de ${MAX_CHARACTERS_PER_ACCOUNT} personagens por conta.`);
    }

    let outfitConfig: Record<string, unknown> | null = null;
    const cleanPath = spriteSheetUrl.replace(/^\//, '');
    const jsonUrl = resolveApiUrl('/' + cleanPath.replace(/\.png$/i, '.json'));
    try {
        const res = await fetch(jsonUrl);
        if (res.ok) {
            outfitConfig = await res.json();
        }
    } catch (e) {
        console.error('Falha ao carregar outfit config durante criação no mock:', e);
    }

    const base = outfitConfig || createDefaultCharacterConfig();
    base.name = name;
    base.spriteSheetUrl = spriteSheetUrl;

    const appearance = {
        gender,
        outfitId,
        spriteSheetUrl,
    };

    const row: CharacterRow = {
        id: uid(),
        accountId,
        name,
        outfitConfig: {
            ...base,
            vocation: vocationId,
            level: 1,
            experience: 0,
            gender,
            appearance,
            gameId: DEFAULT_GAME_CONFIG.id,
            mapId: spawnMapId,
            position: { ...DEFAULT_GAME_CONFIG.start.position },
            direction: DEFAULT_GAME_CONFIG.start.direction,
        } as any,
        spawnMapId,
        createdAt: new Date().toISOString(),
        lastPlayedAt: null,
        vocation: vocationId,
        level: 1,
        experience: 0,
        gender,
        appearance,
        gameId: DEFAULT_GAME_CONFIG.id,
        mapId: spawnMapId,
        position: { ...DEFAULT_GAME_CONFIG.start.position },
        direction: DEFAULT_GAME_CONFIG.start.direction,
    };
    chars.push(row);
    writeChars(chars);
    return row;
}

export function mockSoftDeleteCharacter(id: string, accountId: string): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id && x.accountId === accountId);
    if (c) {
        c.deletedAt = new Date().toISOString();
        writeChars(chars);
    }
}

export function mockUpdateLastPlayed(id: string, accountId: string): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id && x.accountId === accountId);
    if (c) {
        c.lastPlayedAt = new Date().toISOString();
        writeChars(chars);
    }
}

export function mockIsNameTaken(name: string): boolean {
    const lower = name.trim().toLowerCase();
    return readChars().some((c) => !c.deletedAt && c.name.toLowerCase() === lower);
}

export function mockUpdateCharacterLocation(
    id: string,
    location: {
        mapId: string;
        position: { x: number; y: number; z: number };
        direction: 'north' | 'south' | 'east' | 'west';
    }
): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id);
    if (!c) return;

    c.mapId = location.mapId;
    c.position = { ...location.position };
    c.direction = location.direction;
    if (c.outfitConfig) {
        const config = c.outfitConfig as any;
        config.mapId = location.mapId;
        config.position = { ...location.position };
        config.direction = location.direction;
    }
    writeChars(chars);
}

export function mockUpdateCharacterProgress(
    id: string,
    progress: { level: number; experience: number }
): void {
    const chars = readChars();
    const c = chars.find((x) => x.id === id);
    if (!c) return;

    c.level = Math.max(1, Math.floor(progress.level));
    c.experience = Math.max(0, Math.floor(progress.experience));
    if (c.outfitConfig) {
        const config = c.outfitConfig as any;
        config.level = c.level;
        config.experience = c.experience;
    }
    writeChars(chars);
}
