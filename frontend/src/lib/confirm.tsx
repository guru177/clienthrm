import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmOptions = {
    title?: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
};

type ConfirmContextType = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
};

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ description: '' });
    const [resolver, setResolver] = useState<(value: boolean) => void>();

    const confirm: ConfirmContextType = (opts) => {
        return new Promise((resolve) => {
            if (typeof opts === 'string') {
                setOptions({ description: opts });
            } else {
                setOptions({ title: opts.title, description: opts.description, confirmText: opts.confirmText, cancelText: opts.cancelText });
            }
            setIsOpen(true);
            setResolver(() => resolve);
        });
    };

    const handleConfirm = () => {
        setIsOpen(false);
        if (resolver) resolver(true);
    };

    const handleCancel = () => {
        setIsOpen(false);
        if (resolver) resolver(false);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog open={isOpen} onOpenChange={(open) => {
                if (!open && isOpen) {
                    // Dialog closed by clicking outside or pressing ESC
                    handleCancel();
                }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{options.title || 'Confirm Action'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {options.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancel}>
                            {options.cancelText || 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirm}>
                            {options.confirmText || 'Continue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    );
};
