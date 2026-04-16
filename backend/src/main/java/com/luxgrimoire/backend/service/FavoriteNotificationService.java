package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.repository.*;
import org.springframework.stereotype.Service;

/**
 * Sends notifications to users who favorited an entity (with notify=true)
 * when new content related to that entity is added.
 */
@Service
public class FavoriteNotificationService {

    private final UserFavoriteBookRepository     favBookRepo;
    private final UserFavoriteAuthorRepository   favAuthorRepo;
    private final UserFavoriteArtistRepository   favArtistRepo;
    private final UserFavoriteCompanyRepository  favCompanyRepo;
    private final UserFavoriteEditionRepository  favEditionRepo;
    private final NotificationService            notificationService;

    public FavoriteNotificationService(
            UserFavoriteBookRepository favBookRepo,
            UserFavoriteAuthorRepository favAuthorRepo,
            UserFavoriteArtistRepository favArtistRepo,
            UserFavoriteCompanyRepository favCompanyRepo,
            UserFavoriteEditionRepository favEditionRepo,
            NotificationService notificationService) {
        this.favBookRepo         = favBookRepo;
        this.favAuthorRepo       = favAuthorRepo;
        this.favArtistRepo       = favArtistRepo;
        this.favCompanyRepo      = favCompanyRepo;
        this.favEditionRepo      = favEditionRepo;
        this.notificationService = notificationService;
    }

    /** Called when a new edition is added for a book. Notifies book favoriters. */
    public void notifyBookFavoriters(String bookId, String editionName, String bookTitle) {
        String title   = "New edition: " + bookTitle;
        String message = "A new edition \"" + editionName + "\" has been added for " + bookTitle + ".";
        favBookRepo.findByBookIdAndNotifyTrue(bookId)
                .forEach(fav -> notificationService.sendToUser(
                        fav.getUsername(), title, message, "FAVORITE", "system"));
    }

    /** Called when a new edition is added and involves this author. Notifies author favoriters. */
    public void notifyAuthorFavoriters(String authorId, String authorName, String editionName) {
        String title   = "New edition by " + authorName;
        String message = "A new edition \"" + editionName + "\" featuring " + authorName + " is now available.";
        favAuthorRepo.findByAuthorIdAndNotifyTrue(authorId)
                .forEach(fav -> notificationService.sendToUser(
                        fav.getUsername(), title, message, "FAVORITE", "system"));
    }

    /** Called when a new edition is added and involves this artist. Notifies artist favoriters. */
    public void notifyArtistFavoriters(String artistId, String artistName, String editionName) {
        String title   = "New edition with artwork by " + artistName;
        String message = "A new edition \"" + editionName + "\" featuring artwork by " + artistName + " is available.";
        favArtistRepo.findByArtistIdAndNotifyTrue(artistId)
                .forEach(fav -> notificationService.sendToUser(
                        fav.getUsername(), title, message, "FAVORITE", "system"));
    }

    /** Called when a new subscription month/box is published for a company. Notifies company favoriters. */
    public void notifyCompanyFavoriters(String companyId, String companyName, String boxName) {
        String title   = "New box from " + companyName;
        String message = "\"" + boxName + "\" from " + companyName + " has just been announced!";
        favCompanyRepo.findByCompanyIdAndNotifyTrue(companyId)
                .forEach(fav -> notificationService.sendToUser(
                        fav.getUsername(), title, message, "FAVORITE", "system"));
    }
}
