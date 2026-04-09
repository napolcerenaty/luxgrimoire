package com.luxgrimoire.backend.model;

public class AppUser {
    private String username;
    private String password;
    private String firstName;
    private String lastName;
    private String timezone;

    public AppUser(String username, String password, String firstName, String lastName, String timezone) {
        this.username = username;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.timezone = timezone;
    }

    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
}
