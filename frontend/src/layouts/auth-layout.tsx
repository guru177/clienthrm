import AuthLayoutTemplate from '@/layouts/auth/auth-split-layout';

export default function AuthLayout({
    children,
    title,
    description,
    fitViewport,
    scrollableCard,
    ...props
}: {
    children: React.ReactNode;
    title: string;
    description: string;
    fitViewport?: boolean;
    scrollableCard?: boolean;
}) {
    return (
        <AuthLayoutTemplate
            title={title}
            description={description}
            fitViewport={fitViewport}
            scrollableCard={scrollableCard}
            {...props}
        >
            {children}
        </AuthLayoutTemplate>
    );
}
