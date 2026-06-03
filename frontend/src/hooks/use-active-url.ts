import { useLocation } from 'react-router-dom';

export function useActiveUrl() {
    const location = useLocation();
    const currentUrlPath = location.pathname;

    function urlIsActive(urlToCheck: string, currentUrl?: string) {
        const urlToCompare = currentUrl ?? currentUrlPath;
        return urlToCheck === urlToCompare;
    }

    return {
        currentUrl: currentUrlPath,
        urlIsActive,
    };
}
