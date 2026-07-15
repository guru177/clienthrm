import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './login';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        login: mockLogin,
    }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('Login Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders login form correctly', () => {
        render(
            <BrowserRouter>
                <Login />
            </BrowserRouter>
        );
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('calls login function on submit', async () => {
        mockLogin.mockResolvedValueOnce({ kind: 'ok', permissions: ['*'] });
        render(
            <BrowserRouter>
                <Login />
            </BrowserRouter>
        );
        
        fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', undefined);
    });
});
